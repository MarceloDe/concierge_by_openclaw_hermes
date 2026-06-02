import os
import time
import unittest

from fastapi.testclient import TestClient

from project.api.auth import create_access_token
from project.api.main import create_app


class FakeNodeRuntimeClient:
    def __init__(self):
        self.last_chat = None
        self.get_calls = []
        self.post_calls = []

    async def health(self):
        return True

    async def auth_start(self, request):
        return {
            "user": {"id": "user_facade_local", "email": request.member.get("email")},
            "session": {"id": request.session_id or "session_facade_local", "status": "active"}
        }

    async def get_json(self, path, *, params=None):
        self.get_calls.append((path, params or {}))
        if path == "/api/openclaw/official/status":
            return {"ready": True, "liveReadiness": {"status": "ready_for_read_only_approval"}}
        if path == "/api/runtime/events":
            return {"events": [{"eventType": "facade.proxy.checked", "userId": (params or {}).get("userId")}]}
        if path == "/api/worker-continuations":
            return {"continuations": []}
        if path == "/api/document-candidates":
            return {"candidates": []}
        return {"ok": True}

    async def post_json(self, path, body):
        self.post_calls.append((path, body))
        if path == "/api/chat":
            return await self.chat(type("Request", (), {
                "message": body.get("message"),
                "member": body.get("member"),
                "session_id": body.get("sessionId"),
                "resume_latest_session": body.get("resumeLatestSession"),
                "use_live_model": body.get("useLiveModel"),
                "payload_mode": body.get("payloadMode"),
                "execute_evidence_observation": body.get("executeEvidenceObservation"),
                "use_official_openclaw_worker": body.get("useOfficialOpenClawWorker")
            })())
        return {"ok": True, "path": path, "userId": body.get("userId")}

    async def stream_text(self, path, *, params=None):
        self.get_calls.append((path, params or {}))
        yield "event: runtime.stream.opened\ndata: {\"eventType\":\"runtime.stream.opened\"}\n\n"

    async def chat(self, request):
        self.last_chat = request
        return {
            "session": {"id": request.session_id or "session_facade_local"},
            "finalResponse": "LangGraph routed through the Wefella facade.",
            "graphRun": {
                "state": {
                    "workflow": "eligibility_benefits_navigation",
                    "graph_trace_id": "trace_facade_local",
                    "structured_intent": {"intent": "eligibility_benefits"}
                }
            },
            "sourcePointers": []
        }


class FastApiFacadeTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app(inline_tasks=os.getenv("WEFELLA_TEST_NODE_LIVE") == "1")
        self.client = TestClient(self.app)
        self.user_id = "wefella_test_user"
        self.headers = {"Authorization": f"Bearer {create_access_token(self.user_id)}"}

    def test_health_is_public_and_reports_node_runtime(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("node_runtime_ok", body)

    def test_chat_requires_bearer_token(self):
        response = self.client.post("/api/chat", json={"user_id": self.user_id, "message": "Hello"})
        self.assertEqual(response.status_code, 401)

    def test_chat_rejects_user_mismatch(self):
        response = self.client.post(
            "/api/chat",
            headers=self.headers,
            json={"user_id": "other_user", "message": "Hello"}
        )
        self.assertEqual(response.status_code, 403)

    def test_local_session_auth_returns_token_from_node_enrollment(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        response = client.post(
            "/api/auth/local-session",
            json={"member": {"email": "local@example.com", "name": "Local Tester"}}
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["token_type"], "bearer")
        self.assertEqual(body["user_id"], "user_facade_local")
        self.assertEqual(body["session_id"], "session_facade_local")
        self.assertIn("access_token", body)

    def test_task_status_is_bound_to_jwt_subject(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        response = client.post(
            "/api/chat",
            headers={"Authorization": f"Bearer {create_access_token('user_facade_local')}"},
            json={
                "user_id": "user_facade_local",
                "session_id": "session_facade_local",
                "message": "Do I still owe anything before insurance starts paying?",
                "execute_evidence_observation": True,
                "use_official_openclaw_worker": True
            }
        )
        self.assertEqual(response.status_code, 200)
        task_id = response.json()["task_id"]

        mismatch = client.get(
            f"/api/chat/status/{task_id}",
            headers={"Authorization": f"Bearer {create_access_token('other_user')}"}
        )
        self.assertEqual(mismatch.status_code, 403)

        status = client.get(
            f"/api/chat/status/{task_id}",
            headers={"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
        )
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "completed")
        self.assertTrue(app.state.node_client.last_chat.execute_evidence_observation)
        self.assertTrue(app.state.node_client.last_chat.use_official_openclaw_worker)

    def test_stream_returns_terminal_event_for_authorized_task(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
        accepted = client.post(
            "/api/chat",
            headers=headers,
            json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": "Hello"}
        ).json()

        with client.stream("GET", f"/api/chat/stream/{accepted['task_id']}", headers=headers) as stream:
            text = "".join(stream.iter_text())

        self.assertIn("event: runtime_started", text)
        self.assertIn("event: done", text)
        self.assertIn("trace_facade_local", text)

    def test_mvp_proxy_endpoints_require_owner_and_delegate_to_node(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}

        readiness = client.get("/api/openclaw/official/status", headers=headers)
        self.assertEqual(readiness.status_code, 200)
        self.assertEqual(readiness.json()["liveReadiness"]["status"], "ready_for_read_only_approval")

        events = client.get("/api/runtime/events?sessionId=session_facade_local", headers=headers)
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.json()["events"][0]["userId"], "user_facade_local")

        mismatch = client.get(
            "/api/runtime/events?sessionId=session_facade_local&userId=other_user",
            headers=headers
        )
        self.assertEqual(mismatch.status_code, 403)

        approval = client.post(
            "/api/orchestrator/approve",
            headers=headers,
            json={"taskId": "task_one", "sessionId": "session_facade_local"}
        )
        self.assertEqual(approval.status_code, 200)
        self.assertEqual(approval.json()["userId"], "user_facade_local")

        bad_approval = client.post(
            "/api/orchestrator/approve",
            headers=headers,
            json={"taskId": "task_one", "sessionId": "session_facade_local", "userId": "other_user"}
        )
        self.assertEqual(bad_approval.status_code, 403)

        continuation = client.post(
            "/api/worker-continuations",
            headers=headers,
            json={"taskId": "task_one", "sessionId": "session_facade_local"}
        )
        self.assertEqual(continuation.status_code, 200)

        candidate = client.post(
            "/api/document-candidates/propose",
            headers=headers,
            json={"sessionId": "session_facade_local", "candidateId": "candidate_one"}
        )
        self.assertEqual(candidate.status_code, 200)

        proxied_paths = [path for path, _ in app.state.node_client.post_calls]
        self.assertIn("/api/orchestrator/approve", proxied_paths)
        self.assertIn("/api/worker-continuations", proxied_paths)
        self.assertIn("/api/document-candidates/propose", proxied_paths)

    def test_runtime_event_stream_is_proxied_with_authorized_user(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}

        with client.stream("GET", "/api/runtime/events/stream?sessionId=session_facade_local", headers=headers) as stream:
            text = "".join(stream.iter_text())

        self.assertIn("event: runtime.stream.opened", text)
        self.assertIn(("/api/runtime/events/stream", {"sessionId": "session_facade_local", "userId": "user_facade_local"}), app.state.node_client.get_calls)

    @unittest.skipUnless(os.getenv("WEFELLA_TEST_NODE_LIVE") == "1", "Set WEFELLA_TEST_NODE_LIVE=1 with the Node runtime running.")
    def test_chat_delegates_to_real_node_runtime(self):
        response = self.client.post(
            "/api/chat",
            headers=self.headers,
            json={
                "user_id": self.user_id,
                "message": "Do I still owe anything before insurance starts paying?",
                "member": {
                    "name": "Wefella Test User",
                    "email": "wefella-test@example.com",
                    "payer": "Aetna",
                    "portalUrl": "https://www.aetna.com/"
                },
                "use_live_model": False
            }
        )
        self.assertEqual(response.status_code, 200)
        accepted = response.json()
        self.assertEqual(accepted["status"], "queued")
        task_id = accepted["task_id"]

        status = None
        for _ in range(80):
            status_response = self.client.get(f"/api/chat/status/{task_id}", headers=self.headers)
            self.assertEqual(status_response.status_code, 200)
            status = status_response.json()
            if status["status"] in {"completed", "failed"}:
                break
            time.sleep(0.25)

        self.assertIsNotNone(status)
        self.assertEqual(status["status"], "completed")
        self.assertIsNotNone(status["session_id"])
        self.assertIn("graphRun", status["result"])


if __name__ == "__main__":
    unittest.main()
