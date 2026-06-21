import base64
import asyncio
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from project.api.auth import create_access_token
from project.api.main import create_app


class FakeNodeRuntimeClient:
    def __init__(self):
        self.base_url = "http://node-runtime.test"
        self.last_chat = None
        self.last_uploaded_documents = []
        self.get_calls = []
        self.post_calls = []
        self.patch_calls = []

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
        if path == "/api/runtime/browser/screencast/status":
            return {
                "ok": True,
                "sessionId": (params or {}).get("sessionId"),
                "userId": (params or {}).get("userId"),
                "running": True,
                "hasFrame": True,
                "lastFrameAt": "2026-06-15T19:30:00Z",
                "frameSource": "cdp_screenshot_fallback"
            }
        if path == "/api/runtime/events":
            return {"events": [{"eventType": "facade.proxy.checked", "userId": (params or {}).get("userId")}]}
        if path == "/api/worker-continuations":
            return {"continuations": []}
        if path == "/api/handoffs":
            return {
                "version": "test",
                "handoffs": [
                    {
                        "id": "handoff_one",
                        "userId": (params or {}).get("userId"),
                        "sessionId": (params or {}).get("sessionId", "session_facade_local"),
                        "taskId": "task_handoff_one",
                        "handoffType": "urgent_emergency",
                        "priority": "urgent",
                        "status": "open",
                        "summary": "Urgent handoff fixture.",
                        "auditEventId": "audit_handoff_one"
                    }
                ],
                "count": 1,
                "openCount": 1,
                "safety": {"rawUserInputReturned": False, "openclawExecutedByHandoff": False}
            }
        if path == "/api/document-candidates":
            return {"candidates": []}
        if path == "/api/research/kpis":
            return {
                "version": "test",
                "sources": {"total": 1, "approved": 1, "pendingReview": 0, "disabled": 0},
                "runs": {"total": 1, "active": 1, "completed": 0, "cancelled": 0, "latest": {"id": "run_one", "status": "queued"}},
                "artifacts": {"total": 0},
                "schedules": {"total": 1, "active": 1, "paused": 0, "due": 1},
                "reviewQueue": {"feedbackItems": 0},
                "audit": {"totalEvents": 3}
            }
        if path == "/api/research/worker-status":
            return {
                "version": "test",
                "defaultMode": "deterministic_fetch",
                "modes": {
                    "deterministicFetch": {"enabled": True, "mode": "deterministic_fetch"},
                    "mockWorker": {"enabled": True, "mode": "mock_worker", "trustedRetrieval": False},
                    "openclaw": {
                        "enabled": False,
                        "mode": "openclaw",
                        "typedEnvelope": "brainstyworkers.research_worker_task.v1",
                        "approvalGate": "approvedWorkerDispatch=true plus approved source/run"
                    },
                    "hermes": {
                        "enabled": False,
                        "mode": "hermes",
                        "typedEnvelope": "brainstyworkers.research_worker_task.v1",
                        "approvalGate": "approvedWorkerDispatch=true plus approved source/run"
                    }
                }
            }
        if path == "/api/research/embeddings/status":
            return {
                "version": "test",
                "route": {
                    "routeKey": "default",
                    "provider": "local_tfidf",
                    "model": "local-tfidf-v1",
                    "dimensions": 64,
                    "status": "active"
                },
                "latestJob": {"id": "embedding_job_one", "status": "completed", "indexedCount": 1},
                "counts": {"trustedArtifacts": 1, "activeIndexedArtifacts": 1, "staleTrustedArtifacts": 0},
                "safety": {"indexesOnlyApprovedEvidence": True}
            }
        if path == "/api/research/graph":
            return {
                "version": "test",
                "graph": {
                    "status": "ready",
                    "summary": {"nodeCount": 3, "edgeCount": 2},
                    "nodes": [{"id": "source:source_one", "type": "knowledge_source", "label": "Source One"}],
                    "edges": [{"id": "source:source_one->source_has_run->run:run_one", "type": "source_has_run"}]
                },
                "latestBuild": {"id": "research_graph_build_one", "status": "completed", "nodeCount": 3, "edgeCount": 2},
                "safety": {"rawArtifactTextReturned": False, "safeTextPreviewReturned": False}
            }
        if path == "/api/research/citation-closure":
            return {
                "version": "test",
                "latest": {
                    "id": "research_claim_evaluation_one",
                    "actorUserId": (params or {}).get("actorUserId"),
                    "status": "citation_closure_failed",
                    "verdict": "unsupported_claims_found",
                    "claimCount": 2,
                    "supportedCount": 1,
                    "unsupportedCount": 1
                },
                "evaluations": [
                    {
                        "id": "research_claim_evaluation_one",
                        "actorUserId": (params or {}).get("actorUserId"),
                        "status": "citation_closure_failed",
                        "verdict": "unsupported_claims_found"
                    }
                ],
                "safety": {"judgeCreatesEvidence": False, "trustedEvidenceOnly": True}
            }
        if path == "/api/operator/tools":
            return {
                "version": "test",
                "tools": [
                    {"key": "research.searchEvidence", "type": "read", "approvalRequired": False},
                    {"key": "research.getEmbeddingStatus", "type": "read", "approvalRequired": False},
                    {"key": "research.getGraph", "type": "read", "approvalRequired": False},
                    {"key": "research.listCitationClosure", "type": "read", "approvalRequired": False},
                    {"key": "research.listSchedules", "type": "read", "approvalRequired": False},
                    {"key": "research.proposeSource", "type": "write", "approvalRequired": True},
                    {"key": "research.createSchedule", "type": "write", "approvalRequired": True},
                    {"key": "research.reindexEmbeddings", "type": "write", "approvalRequired": True},
                    {"key": "research.buildGraph", "type": "write", "approvalRequired": True},
                    {"key": "research.evaluateCitationClosure", "type": "write", "approvalRequired": True}
                ]
            }
        if path == "/api/operator/proposals":
            return {
                "version": "test",
                "proposals": [
                    {
                        "id": "operator_proposal_one",
                        "actorUserId": (params or {}).get("actorUserId"),
                        "toolKey": "research.proposeSource",
                        "status": "pending_approval"
                    }
                ]
            }
        if path == "/api/research/artifacts":
            return {
                "version": "test",
                "artifacts": [
                    {
                        "id": "artifact_one",
                        "runId": "run_one",
                        "sourceId": "source_one",
                        "artifactType": "deterministic_fetch_text",
                        "citationStatus": "extracted_pending_review",
                        "title": "Operator Artifact One"
                    }
                ],
                "reviewQueue": {"pendingArtifacts": 1, "trustedRetrieval": 0}
            }
        if path == "/api/research/search" or path == "/api/research/evidence":
            return {
                "version": "test",
                "query": (params or {}).get("q") or (params or {}).get("query") or "",
                "status": "trusted_evidence_found",
                "trustedResultCount": 1,
                "pendingReviewCount": 0,
                "results": [
                    {
                        "artifactId": "artifact_one",
                        "runId": "run_one",
                        "sourceId": "source_one",
                        "title": "Operator Artifact One",
                        "citationStatus": "trusted_retrieval_approved",
                        "score": 7,
                        "snippet": "Grounded benefits evidence"
                    }
                ]
            }
        if path == "/api/research/schedules":
            return {
                "version": "test",
                "dueCount": 1,
                "schedules": [
                    {
                        "id": "research_schedule_one",
                        "scheduleKey": "research_schedule_operator_source_one_general_rag",
                        "actorUserId": (params or {}).get("actorUserId"),
                        "sourceId": "source_one",
                        "sourceKey": "operator_source_one",
                        "scheduleLabel": "Nightly approved source refresh",
                        "intervalHours": 24,
                        "workflowKey": "general_rag",
                        "workerMode": "deterministic_fetch",
                        "status": "active",
                        "approvalStatus": "approved",
                        "nextRunAt": "2026-06-01T00:00:00.000Z",
                        "runCount": 0
                    }
                ]
            }
        if path == "/api/research/scheduler/status":
            return {
                "version": "test",
                "daemon": {
                    "daemonKey": "research_scheduler_daemon_default",
                    "actorUserId": (params or {}).get("actorUserId"),
                    "status": "tick_completed",
                    "enabled": True,
                    "intervalMs": 60000,
                    "tickLimit": 5,
                    "lastProcessedCount": 1,
                    "lastBlockedCount": 0,
                    "tickCount": 1,
                    "runtime": {"processStatus": "running", "intervalHandleActive": True}
                },
                "dueCount": 1,
                "schedules": {"dueCount": 1, "activeCount": 1, "loadedCount": 1},
                "safety": {"onlyApprovedSchedules": True, "hiddenWorkerDispatch": False}
            }
        if path == "/api/audit":
            return {
                "version": "test",
                "status": "audit_visible_and_chain_valid",
                "filters": {
                    "eventPrefix": (params or {}).get("prefix") or (params or {}).get("eventPrefix"),
                    "actorUserId": (params or {}).get("actorUserId")
                },
                "pagination": {"returned": 1, "total": 1, "limit": int((params or {}).get("limit", 25))},
                "chain": {"valid": True, "checkedChains": 1, "hashedCount": 1},
                "safety": {"rawDetailsReturned": False},
                "events": [
                    {
                        "id": "audit_one",
                        "sessionId": None,
                        "eventType": "research_schedule_tick_run_created",
                        "detailsHash": "hash_details",
                        "detailsPreview": "{\"safe\":true}",
                        "eventHash": "hash_event"
                    }
                ]
            }
        if path == "/api/research/sources":
            return {
                "sources": [
                    {
                        "id": "source_one",
                        "sourceKey": "operator_source_one",
                        "title": "Operator Source One",
                        "status": "approved",
                        "baseUrl": "https://example.invalid/source",
                        "approved": True
                    }
                ]
            }
        if path == "/api/research/runs":
            return {
                "runs": [
                    {
                        "id": "run_one",
                        "sourceKey": "operator_source_one",
                        "actorUserId": (params or {}).get("actorUserId"),
                        "status": "queued",
                        "topic": "Benefits source review"
                    }
                ]
            }
        if path == "/api/research/runs/run_one/events":
            return {
                "runId": "run_one",
                "events": [{"id": "event_one", "eventType": "research_run_queued", "status": "queued"}]
            }
        if path == "/api/research/runs/run_one":
            return {
                "run": {"id": "run_one", "sourceKey": "operator_source_one", "status": "queued", "topic": "Benefits source review"},
                "events": [{"id": "event_one", "eventType": "research_run_queued", "status": "queued"}]
            }
        if path.startswith("/api/sessions/") and path.endswith("/export"):
            return {
                "ok": True,
                "sessionId": path.split("/")[-2],
                "filename": "brainstyworkers-session-export.md",
                "contentType": "text/markdown",
                "content": "# Brainstyworkers Concierge Session Export\n\n## Latest Answer\n\nSourced answer.",
                "messageCount": 2,
                "sourcePointerCount": 1,
                "latestAssistantMessageId": "msg_assistant"
            }
        if path.startswith("/api/sessions/"):
            return {
                "session": {"id": path.split("/")[-1], "user_id": (params or {}).get("userId"), "status": "active"},
                "messages": [
                    {"id": "msg_user", "role": "user", "content": "Question", "contentHash": "hash_user"},
                    {"id": "msg_assistant", "role": "assistant", "content": "Sourced answer", "contentHash": "hash_answer"}
                ],
                "sourcePointers": [{"table": "uploaded_document_extractions", "id": "upload_one"}],
                "sourcePointerCount": 1,
                "feedback": [],
                "exportAvailable": True
            }
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
        if path == "/api/orchestrator/approve":
            return {
                "ok": True,
                "userId": body.get("userId"),
                "status": "approved",
                "approvalToken": "approval_token_v1",
                "approval": {
                    "taskId": body.get("approvalTaskId") or body.get("taskId"),
                    "approvalScope": body.get("approvalScope"),
                    "allowedAction": body.get("allowedAction"),
                    "actionsTaken": []
                }
            }
        if path == "/api/runtime/browser/screencast/start":
            return {
                "ok": True,
                "status": "screencast_started",
                "sessionId": body.get("sessionId"),
                "userId": body.get("userId"),
                "targetUrl": body.get("targetUrl"),
                "actionsTaken": ["browser_screencast_started"]
            }
        if path == "/api/runtime/browser/takeover/request":
            return {
                "ok": True,
                "status": "interactive_takeover_pending_approval",
                "takeoverId": "takeover_v1",
                "sessionId": body.get("sessionId")
            }
        if path == "/api/runtime/browser/takeover/grant":
            return {
                "ok": True,
                "status": "interactive_takeover_granted",
                "takeoverId": body.get("takeoverId"),
                "grantToken": "grant_token_v1"
            }
        if path == "/api/runtime/browser/takeover/input":
            return {
                "ok": True,
                "status": "interactive_takeover_input_relayed",
                "takeoverId": body.get("takeoverId"),
                "inputAccepted": True
            }
        if path == "/api/runtime/browser/takeover/end":
            return {
                "ok": True,
                "status": "interactive_takeover_ended",
                "takeoverId": body.get("takeoverId")
            }
        if path == "/api/feedback":
            return {
                "ok": True,
                "feedback": {
                    "id": "feedback_one",
                    "sessionId": body.get("sessionId"),
                    "userId": body.get("userId"),
                    "messageId": body.get("messageId"),
                    "taskId": body.get("taskId"),
                    "answerHash": body.get("answerHash"),
                    "rating": body.get("rating"),
                    "comment": body.get("comment"),
                    "sourcePointerCount": 1,
                    "status": "recorded"
                },
                "audit": {"id": "audit_feedback", "eventType": "user_feedback_recorded"}
            }
        if path == "/api/research/runs":
            return {
                "ok": True,
                "run": {
                    "id": "run_one",
                    "sourceId": body.get("sourceId"),
                    "actorUserId": body.get("actorUserId"),
                    "status": "queued",
                    "topic": body.get("topic")
                },
                "event": {"id": "event_one", "eventType": "research_run_queued", "status": "queued"}
            }
        if path == "/api/research/runs/run_one/cancel":
            return {
                "ok": True,
                "run": {"id": "run_one", "actorUserId": body.get("actorUserId"), "status": "cancelled"},
                "event": {"id": "event_cancel", "eventType": "research_run_cancelled", "status": "cancelled"}
            }
        if path == "/api/research/runs/run_one/retry":
            return {
                "ok": True,
                "run": {"id": "run_retry", "actorUserId": body.get("actorUserId"), "status": "queued", "retryOfRunId": "run_one"},
                "event": {"id": "event_retry", "eventType": "research_run_queued", "status": "queued"}
            }
        if path == "/api/research/runs/run_one/execute":
            return {
                "ok": True,
                "run": {"id": "run_one", "actorUserId": body.get("actorUserId"), "status": "completed"},
                "event": {"id": "event_execute", "eventType": "research_run_execution_completed", "status": "completed"},
                "artifact": {
                    "id": "artifact_one",
                    "artifactType": body.get("workerMode", "deterministic_fetch"),
                    "citationStatus": "extracted_pending_review",
                    "contentHash": "hash_content",
                    "extractionHash": "hash_extraction",
                    "metadata": {"approvedWorkerDispatch": body.get("approvedWorkerDispatch", False)}
                },
                "workerResult": {"status": "success", "actionsTaken": ["facade_test_worker_action"]} if body.get("workerMode") in ["openclaw", "hermes"] else None
            }
        if path == "/api/research/schedules/tick":
            return {
                "ok": True,
                "scheduler": {
                    "mode": "queue_due_runs",
                    "processedCount": 1,
                    "blockedCount": 0,
                    "actionsTaken": ["queued:run_one"]
                },
                "processed": [
                    {
                        "schedule": {"id": "research_schedule_one", "actorUserId": body.get("actorUserId"), "status": "active", "runCount": 1},
                        "run": {"id": "run_one", "status": "queued", "actorUserId": body.get("actorUserId")}
                    }
                ]
            }
        if path == "/api/research/scheduler/tick":
            return {
                "ok": True,
                "status": "tick_completed",
                "daemon": {
                    "daemonKey": "research_scheduler_daemon_default",
                    "actorUserId": body.get("actorUserId"),
                    "status": "tick_completed",
                    "enabled": True,
                    "lastProcessedCount": 1,
                    "lastBlockedCount": 0,
                    "tickCount": 2
                },
                "scheduler": {
                    "mode": "queue_due_runs",
                    "processedCount": 1,
                    "blockedCount": 0,
                    "actionsTaken": ["queued:run_daemon_one"]
                },
                "runtimeEvents": [
                    {"eventType": "research.scheduler.daemon.tick_started"},
                    {"eventType": "research.scheduler.daemon.tick_completed"}
                ],
                "audit": {"eventType": "research_scheduler_daemon_tick_completed"}
            }
        if path == "/api/research/embeddings/route":
            return {
                "ok": True,
                "route": {
                    "routeKey": "default",
                    "provider": body.get("provider", "local_tfidf"),
                    "model": body.get("model") or "local-tfidf-v1",
                    "dimensions": body.get("dimensions") or 64,
                    "status": "active",
                    "selectedBy": body.get("actorUserId")
                },
                "audit": {"id": "audit_embedding_route", "eventType": "research_embedding_route_selected"}
            }
        if path == "/api/research/embeddings/reindex":
            return {
                "ok": True,
                "status": "completed",
                "job": {"id": "embedding_job_one", "routeKey": body.get("routeKey", "default"), "status": "completed", "indexedCount": 1},
                "actionsTaken": ["research_embedding_vectors_written"],
                "audit": {"id": "audit_embedding_reindex", "eventType": "research_embedding_reindex_completed"}
            }
        if path == "/api/research/graph/build":
            return {
                "version": "test",
                "status": "graph_build_completed",
                "build": {
                    "id": "research_graph_build_one",
                    "actorUserId": body.get("actorUserId"),
                    "status": "completed",
                    "nodeCount": 3,
                    "edgeCount": 2,
                    "graphHash": "graph_hash_one"
                },
                "graph": {"status": "ready", "summary": {"nodeCount": 3, "edgeCount": 2}, "nodes": [], "edges": []},
                "safety": {"rawArtifactTextReturned": False, "safeTextPreviewReturned": False},
                "audit": {"id": "audit_graph_build", "eventType": "research_graph_build_completed"},
                "actionsTaken": ["research_graph_metadata_snapshot_built", "research_graph_build_recorded"]
            }
        if path == "/api/research/citation-closure/evaluate":
            return {
                "version": "test",
                "status": "citation_closure_failed",
                "verdict": "unsupported_claims_found",
                "evaluation": {
                    "id": "research_claim_evaluation_one",
                    "actorUserId": body.get("actorUserId"),
                    "claimCount": 2,
                    "supportedCount": 1,
                    "unsupportedCount": 1,
                    "safety": {"judgeCreatesEvidence": False},
                    "evaluation": {
                        "claims": [
                            {"id": "claim_1", "status": "supported", "citations": [{"artifactId": "artifact_one"}]},
                            {"id": "claim_2", "status": "unsupported", "citations": []}
                        ]
                    }
                },
                "audit": {"id": "audit_claim_closure", "eventType": "research_claim_citation_closure_evaluated"},
                "safety": {"judgeCreatesEvidence": False, "trustedEvidenceOnly": True},
                "actionsTaken": ["research_claims_extracted", "trusted_research_evidence_scored", "claim_citation_labels_written"]
            }
        if path == "/api/research/artifacts/artifact_one/review":
            return {
                "ok": True,
                "artifact": {
                    "id": "artifact_one",
                    "runId": "run_one",
                    "citationStatus": "trusted_retrieval_approved",
                    "metadata": {
                        "citationReview": {
                            "decision": body.get("decision"),
                            "actorUserId": body.get("actorUserId")
                        }
                    }
                },
                "event": {"id": "event_artifact_review", "eventType": "research_artifact_approved"},
                "audit": {"id": "audit_artifact_review", "eventType": "research_artifact_approved"}
            }
        if path == "/api/research/sources/propose":
            return {
                "ok": True,
                "source": {
                    "id": "source_one",
                    "sourceKey": "operator_source_one",
                    "title": body.get("title"),
                    "proposedBy": body.get("actorUserId"),
                    "status": "pending_review"
                }
            }
        if path == "/api/research/sources/source_one/approve":
            return {
                "ok": True,
                "source": {"id": "source_one", "approvedBy": body.get("actorUserId"), "status": "approved"}
            }
        if path == "/api/research/sources/source_one/reject":
            return {
                "ok": True,
                "source": {"id": "source_one", "status": "rejected"}
            }
        if path == "/api/operator/assistant":
            return {
                "ok": True,
                "version": "test",
                "status": "proposal_pending_approval",
                "mode": "proposal_only",
                "proposal": {
                    "id": "operator_proposal_one",
                    "actorUserId": body.get("actorUserId"),
                    "toolKey": "research.proposeSource",
                    "status": "pending_approval",
                    "args": body.get("args") or {"url": "https://example.invalid/source"}
                },
                "actionsTaken": []
            }
        if path == "/api/operator/proposals/operator_proposal_one/approve":
            return {
                "ok": True,
                "status": "proposal_executed",
                "proposal": {
                    "id": "operator_proposal_one",
                    "actorUserId": body.get("actorUserId"),
                    "toolKey": "research.proposeSource",
                    "status": "executed",
                    "executionCount": 1
                },
                "actionsTaken": ["research.proposeSource"]
            }
        if path == "/api/operator/proposals/operator_proposal_one/reject":
            return {
                "ok": True,
                "status": "proposal_rejected",
                "proposal": {
                    "id": "operator_proposal_one",
                    "actorUserId": body.get("actorUserId"),
                    "toolKey": "research.proposeSource",
                    "status": "rejected",
                    "executionCount": 0
                },
                "actionsTaken": []
            }
        return {"ok": True, "path": path, "userId": body.get("userId")}

    async def patch_json(self, path, body):
        self.patch_calls.append((path, body))
        if path == "/api/research/sources/source_one":
            return {
                "ok": True,
                "source": {
                    "id": "source_one",
                    "actorUserId": body.get("actorUserId"),
                    "status": body.get("patch", {}).get("status", "approved"),
                    "priority": body.get("patch", {}).get("priority", 100)
                }
            }
        return {"ok": True, "path": path}

    async def stream_text(self, path, *, params=None):
        self.get_calls.append((path, params or {}))
        yield "event: runtime.stream.opened\ndata: {\"eventType\":\"runtime.stream.opened\"}\n\n"

    async def chat(self, request, *, uploaded_documents=None):
        self.last_chat = request
        self.last_uploaded_documents = uploaded_documents or []
        return {
            "session": {"id": request.session_id or "session_facade_local"},
            "finalResponse": "LangGraph routed through the Wefella facade.",
            "graphRun": {
                "state": {
                    "workflow": "eligibility_benefits_navigation",
                    "graph_trace_id": "trace_facade_local",
                    "structured_intent": {"intent": "eligibility_benefits"},
                    "uploaded_document_context": {
                        "documentCount": len(self.last_uploaded_documents)
                    }
                }
            },
            "sourcePointers": []
        }


class FakeUnavailableNodeRuntimeClient(FakeNodeRuntimeClient):
    async def health(self):
        return False


class FastApiFacadeTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app(inline_tasks=os.getenv("WEFELLA_TEST_NODE_LIVE") == "1")
        self.client = TestClient(self.app)
        self.user_id = "wefella_test_user"
        self.headers = {"Authorization": f"Bearer {create_access_token(self.user_id)}"}

    def bearer_headers(self, user_id, *, extra_claims=None):
        return {"Authorization": f"Bearer {create_access_token(user_id, extra_claims=extra_claims)}"}

    def valid_visual_ocr_manifest(self):
        return {
            "schemaVersion": "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1",
            "providerLiveConnected": True,
            "session": {"sessionRefPresent": True, "rawSessionRefReturned": False},
            "stream": {"frameRefPresent": True, "rawFrameReturned": False, "rawFramePersisted": False},
            "screenshot": {"screenshotRefPresent": True, "rawImageReturned": False},
            "ocrCaption": {
                "captionRefPresent": True,
                "rawOcrTextReturned": False,
                "rawOcrTextPersisted": False,
                "visualCaptionSafe": True
            },
            "takeover": {"approvalRequired": True, "inputRelay": "approval_gated_human_only"},
            "input": {"rawInputReturned": False, "externalWriteActionsWithoutApproval": False},
            "teardown": {"teardownComplete": True, "rawFramePersisted": False, "rawOcrTextPersisted": False},
            "visualProof": {
                "dashboardScreenshotRefPresent": True,
                "mobileLiveBlockRefPresent": True,
                "ocrCaptionRefPresent": True
            },
            "safety": {
                "agentCredentialEntryAllowed": False,
                "externalWriteActionsWithoutApproval": False,
                "rawEndpointReturned": False,
                "rawSecretReturned": False
            }
        }

    def operator_headers(self, user_id="operator_user"):
        return self.bearer_headers(user_id, extra_claims={"roles": ["operator"]})

    def admin_headers(self, user_id="admin_user"):
        return self.bearer_headers(user_id, extra_claims={"roles": ["admin"]})

    def wait_for_task(self, client, headers, task_id, *, attempts=120, sleep_seconds=0.25):
        status = None
        for _ in range(attempts):
            status_response = client.get(f"/api/chat/status/{task_id}", headers=headers)
            self.assertEqual(status_response.status_code, 200)
            status = status_response.json()
            if status["status"] in {"completed", "failed"}:
                break
            time.sleep(sleep_seconds)
        self.assertIsNotNone(status)
        self.assertEqual(status["status"], "completed")
        return status["result"]

    def submit_chat_and_wait(self, client, headers, body):
        response = client.post("/api/chat", headers=headers, json=body)
        self.assertEqual(response.status_code, 200)
        accepted = response.json()
        self.assertEqual(accepted["status"], "queued")
        return self.wait_for_task(client, headers, accepted["task_id"])

    def test_health_is_public_and_reports_node_runtime(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("node_runtime_ok", body)
        self.assertEqual(body["auth"]["mode"], "local")
        self.assertTrue(body["auth"]["local_auth_enabled"])
        self.assertEqual(body["task_registry"]["backend"], "memory")
        self.assertTrue(body["rate_limit"]["enabled"])
        self.assertIn("source_grounding", body)
        self.assertIn("observability", body)
        self.assertEqual(body["observability"]["payload_policy"], "hashes_and_safe_status_only")
        self.assertEqual(body["uploads"]["backend"], "local_filesystem")
        self.assertTrue(body["cors"]["production_safe"])
        self.assertTrue(body["auth"]["rbac"]["enabled"])
        self.assertEqual(body["auth"]["rbac"]["default_role"], "user")
        self.assertIn("operator", body["auth"]["rbac"]["operator_roles"])
        self.assertIn("roles", body["auth"]["rbac"]["supported_claims"])

    def test_readiness_reports_safe_deployment_checks(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        response = client.get("/api/readiness")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        self.assertTrue(body["checks"]["node_runtime"]["ok"])
        self.assertTrue(body["checks"]["auth"]["ok"])
        self.assertTrue(body["checks"]["cors"]["ok"])
        self.assertIn("observability", body["checks"])
        self.assertTrue(body["checks"]["uploads"]["ok"])

    def test_v1_connector_session_task_status_and_proof_contract(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)

        session_response = client.post(
            "/api/v1/sessions",
            json={
                "member": {
                    "name": "Facade V1 User",
                    "email": "facade-v1@example.com",
                    "payer": "Aetna"
                }
            }
        )
        self.assertEqual(session_response.status_code, 200)
        session = session_response.json()
        self.assertEqual(session["public_api_base"], "/api/v1")
        headers = {"Authorization": f"Bearer {session['access_token']}"}

        accepted_response = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={
                "journey": "eligibility_benefits_navigation",
                "message": "Do I still owe anything before insurance starts paying?",
                "session_id": session["session_id"],
                "client_context": {"surface": "next_mobile_pwa"}
            }
        )
        self.assertEqual(accepted_response.status_code, 200)
        accepted = accepted_response.json()
        self.assertEqual(accepted["status"], "queued")
        self.assertEqual(accepted["links"]["self"], f"/api/v1/tasks/{accepted['task_id']}")

        status_response = client.get(f"/api/v1/tasks/{accepted['task_id']}", headers=headers)
        self.assertEqual(status_response.status_code, 200)
        status = status_response.json()
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["answer"], "LangGraph routed through the Wefella facade.")
        self.assertEqual(app.state.node_client.last_chat.user_id, session["user_id"])
        self.assertEqual(app.state.node_client.last_chat.session_id, session["session_id"])

        proof_response = client.get("/api/v1/proof/runs/server-connector-next-mobile-mvp", headers=headers)
        self.assertEqual(proof_response.status_code, 200)
        proof = proof_response.json()
        self.assertEqual(proof["cycle"], "server_connector_next_mobile_mvp")
        self.assertTrue(any(goal["key"] == "fastapi_v1_connector" for goal in proof["goals"]))
        self.assertTrue(any(item["route"] == "/api/v1/browser/sessions/{id}/stream" for item in proof["visual_artifacts"]))

    def test_v1_task_proposal_approval_and_browser_sandbox_routes(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.bearer_headers("v1_user")
        task = asyncio.run(app.state.registry.create(user_id="v1_user", session_id="session_v1"))
        asyncio.run(app.state.registry.update(
            task["task_id"],
            status="completed",
            result={
                "finalResponse": "Approval is required before the worker observes the portal.",
                "graphRun": {
                    "state": {
                        "evidence_observation": {"status": "waiting_for_approval"},
                        "openclaw_task_proposal": {
                            "selectedSkill": {"skillKey": "insurance_portal_browser"},
                            "selectedExecutor": {"executorKey": "read_only_browser"},
                            "proposedSubtasks": ["observe authenticated portal"],
                            "requiredEvidence": ["source_pointer"],
                            "blockedActions": ["credential_entry", "form_submission"],
                            "fallbackPath": ["manual_user_export"],
                            "terminalOutcome": "not_possible_policy_or_approval_block"
                        },
                        "openclaw_worker_plan": {
                            "workerJobs": [
                                {
                                    "approval": {"scope": "read_only_observation"},
                                    "fallbackPath": ["manual_user_export"],
                                    "blockedActions": ["credential_entry", "form_submission"]
                                }
                            ]
                        },
                        "openclaw_skill_proposal": {
                            "task": {
                                "id": "approval_task_v1",
                                "status": "pending_approval",
                                "approval_scope": "read_only_observation"
                            }
                        }
                    }
                },
                "sourcePointers": []
            },
            event="runtime_completed"
        ))

        status_response = client.get(f"/api/v1/tasks/{task['task_id']}", headers=headers)
        self.assertEqual(status_response.status_code, 200)
        status = status_response.json()
        self.assertEqual(status["status"], "approval_pending")
        self.assertEqual(status["proposal"]["selected_skill"], "insurance_portal_browser")
        self.assertEqual(status["proposal"]["selected_executor"], "read_only_browser")
        self.assertIn("credential_entry", status["proposal"]["blocked_actions"])

        approval_response = client.post(
            f"/api/v1/tasks/{task['task_id']}/approvals",
            headers=headers,
            json={"decision": "approved", "scope": "read_only_observation", "action_type": "read_only_observation"}
        )
        self.assertEqual(approval_response.status_code, 200)
        approval = approval_response.json()
        self.assertEqual(approval["approval_task_id"], "approval_task_v1")
        self.assertEqual(approval["approvalToken"], "approval_token_v1")
        self.assertEqual(app.state.node_client.post_calls[-1][0], "/api/orchestrator/approve")

        browser_response = client.post(
            "/api/v1/browser/sessions",
            headers=headers,
            json={"session_id": "session_v1", "target_url": "https://health.aetna.com/", "provider": "local_cdp"}
        )
        self.assertEqual(browser_response.status_code, 200)
        browser = browser_response.json()
        self.assertEqual(browser["provider"], "local_cdp")
        self.assertEqual(browser["stream_url"], f"/api/v1/browser/sessions/{browser['browser_session_id']}/stream")
        self.assertEqual(browser["ocr_caption"]["status"], "visual_frame_available")
        self.assertEqual(browser["ocr_caption"]["frameSource"], "cdp_screenshot_fallback")
        self.assertTrue(browser["screencast"]["status_probe"]["hasFrame"])
        self.assertFalse(browser["ocr_caption"]["rawOcrTextReturned"])

        takeover_response = client.post(
            f"/api/v1/browser/sessions/{browser['browser_session_id']}/takeover",
            headers=headers,
            json={"mode": "request", "reason": "user_password_or_captcha"}
        )
        self.assertEqual(takeover_response.status_code, 200)
        self.assertEqual(takeover_response.json()["takeoverId"], "takeover_v1")

        grant_response = client.post(
            f"/api/v1/browser/sessions/{browser['browser_session_id']}/takeover",
            headers=headers,
            json={"mode": "grant", "takeover_id": "takeover_v1"}
        )
        self.assertEqual(grant_response.status_code, 200)
        self.assertEqual(grant_response.json()["grantToken"], "grant_token_v1")

        input_response = client.post(
            f"/api/v1/browser/sessions/{browser['browser_session_id']}/input",
            headers=headers,
            json={"takeover_id": "takeover_v1", "grant_token": "grant_token_v1", "input": {"type": "key", "key": "Tab"}}
        )
        self.assertEqual(input_response.status_code, 200)
        self.assertTrue(input_response.json()["inputAccepted"])

        stream_response = client.get(browser["stream_url"], headers=headers)
        self.assertEqual(stream_response.status_code, 200)
        self.assertIn("runtime.stream.opened", stream_response.text)

    def test_hosted_browser_sandbox_provider_fails_closed_until_configured(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.bearer_headers("v1_hosted_browser_user")

        browser_response = client.post(
            "/api/v1/browser/sessions",
            headers=headers,
            json={"session_id": "session_hosted_browser", "target_url": "https://health.aetna.com/", "provider": "hosted_remote"}
        )
        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("Hosted browser sandbox provider is not configured", browser_response.json()["detail"])

        proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider", headers=headers)
        self.assertEqual(proof_response.status_code, 200)
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "local_cdp_default")
        self.assertFalse(hosted_check["safety"]["rawOcrTextReturned"])
        self.assertFalse(hosted_check["safety"]["agentCredentialEntryAllowed"])
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_resolver_requires_endpoint_and_secret(self):
        hosted_config = "project/deployment/browser-sandbox-provider.hosted-provider.example.json"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": hosted_config
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_resolver_missing_user")
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_resolver_missing",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-resolver", headers=headers)

        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("endpoint or secret is not resolved", browser_response.json()["detail"])
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        resolver_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_resolver")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "hosted_browser_sandbox_provider_missing_endpoint_or_secret")
        self.assertFalse(hosted_check["hostedProviderResolver"]["endpointResolved"])
        self.assertFalse(hosted_check["hostedProviderResolver"]["authResolved"])
        self.assertFalse(hosted_check["hostedProviderResolver"]["rawEndpointReturned"])
        self.assertFalse(hosted_check["hostedProviderResolver"]["rawSecretReturned"])
        self.assertEqual(resolver_score["score"], 0)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_resolver_never_overclaims_live_provider(self):
        hosted_config = "project/deployment/browser-sandbox-provider.hosted-provider.example.json"
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": hosted_config,
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_resolver_user")
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_resolver",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-resolver", headers=headers)

        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("live provider verification has not passed", browser_response.json()["detail"])
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        resolver_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_resolver")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "hosted_browser_sandbox_provider_configured_unverified")
        self.assertTrue(hosted_check["hostedProviderResolver"]["endpointResolved"])
        self.assertTrue(hosted_check["hostedProviderResolver"]["authResolved"])
        self.assertFalse(hosted_check["hostedProviderResolver"]["liveVerified"])
        self.assertEqual(resolver_score["score"], 50)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_adapter_contract_never_overclaims_live_provider(self):
        hosted_config = "project/deployment/browser-sandbox-provider.hosted-provider.example.json"
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": hosted_config,
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_adapter_user")
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_adapter",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-adapter", headers=headers)

        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("adapter contract is ready", browser_response.json()["detail"])
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        adapter_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_adapter")
        resolver_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_resolver")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "hosted_browser_sandbox_provider_adapter_contract_ready")
        self.assertTrue(hosted_check["hostedProviderAdapterReady"])
        self.assertEqual(adapter_score["score"], 75)
        self.assertEqual(resolver_score["score"], 50)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_http_adapter_harness_never_overclaims_live_provider(self):
        hosted_config = "project/deployment/browser-sandbox-provider.hosted-provider.example.json"
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": hosted_config,
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_http_adapter_user")
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_http_adapter",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-http-adapter", headers=headers)

        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("HTTP adapter harness is ready", browser_response.json()["detail"])
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        http_adapter_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_http_adapter")
        adapter_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_adapter")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "hosted_browser_sandbox_provider_http_adapter_harness_ready")
        self.assertTrue(hosted_check["hostedProviderAdapterReady"])
        self.assertTrue(hosted_check["hostedProviderHttpAdapterReady"])
        self.assertEqual(http_adapter_score["score"], 85)
        self.assertEqual(adapter_score["score"], 75)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_live_lifecycle_harness_never_overclaims_live_provider(self):
        hosted_config = "project/deployment/browser-sandbox-provider.hosted-provider.example.json"
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": hosted_config,
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_LIFECYCLE_HARNESS_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_live_lifecycle_user")
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_live_lifecycle",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-live-lifecycle", headers=headers)

        self.assertEqual(browser_response.status_code, 400)
        self.assertIn("live lifecycle harness is ready", browser_response.json()["detail"])
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        hosted_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider")
        live_lifecycle_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_live_lifecycle")
        http_adapter_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_http_adapter")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(hosted_check["status"], "hosted_browser_sandbox_provider_live_lifecycle_harness_ready")
        self.assertTrue(hosted_check["hostedProviderAdapterReady"])
        self.assertTrue(hosted_check["hostedProviderHttpAdapterReady"])
        self.assertTrue(hosted_check["hostedProviderLiveLifecycleHarnessReady"])
        self.assertEqual(live_lifecycle_score["score"], 95)
        self.assertEqual(http_adapter_score["score"], 85)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_selection_preflight_never_overclaims_live_provider(self):
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
            "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_selection_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-selection", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn("https://", proof_text)
        self.assertNotIn("Bearer ", proof_text)
        proof = proof_response.json()
        selection_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_selection")
        selection_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_selection")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(selection_check["status"], "hosted_browser_sandbox_provider_selection_preflight_ready")
        self.assertTrue(selection_check["preflightReady"])
        self.assertEqual(selection_check["selectedProviderKey"], "custom_webrtc")
        self.assertEqual(selection_score["score"], 90)
        self.assertEqual(hosted_score["score"], 0)

    def test_steel_self_host_operations_visible_without_hosted_remote_overclaim(self):
        with patch.dict(os.environ, {}, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_steel_operations_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-steel-operations", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn("http://127.0.0.1", proof_text)
        self.assertNotIn("ws://127.0.0.1", proof_text)
        self.assertNotIn("Bearer ", proof_text)
        proof = proof_response.json()
        operations_goal = next(goal for goal in proof["goals"] if goal["key"] == "hosted_browser_sandbox_provider_steel_operations")
        operations_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_steel_operations")
        operations_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_steel_operations")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(operations_goal["status"], "steel_self_host_operations_contract_ready")
        self.assertEqual(operations_check["status"], "steel_self_host_operations_contract_ready")
        self.assertTrue(operations_check["contractReady"])
        self.assertFalse(operations_check["ok"])
        self.assertEqual(operations_score["score"], 85)
        self.assertEqual(hosted_score["score"], 0)

    def test_steel_self_host_operations_gate_scores_without_hosted_remote_overclaim(self):
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE": "1",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": "http://127.0.0.1:3000",
            "WEFELLA_BROWSER_SANDBOX_CDP_URL": "ws://127.0.0.1:9223",
            "WEFELLA_BROWSER_SANDBOX_VIEWER_URL": "http://127.0.0.1:5173"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_steel_operations_gate_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-steel-operations-ready", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn("http://127.0.0.1", proof_text)
        self.assertNotIn("ws://127.0.0.1", proof_text)
        proof = proof_response.json()
        operations_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_steel_operations")
        operations_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_steel_operations")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(operations_check["status"], "steel_self_host_operations_ready")
        self.assertTrue(operations_check["ok"])
        self.assertEqual(operations_score["score"], 100)
        self.assertEqual(hosted_score["score"], 0)

    def test_steel_remote_host_readiness_visible_without_hosted_remote_overclaim(self):
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_REMOTE_PROOF_FILE": os.path.join(tempfile.gettempdir(), "missing-steel-remote-proof.json")
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_steel_remote_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-steel-remote-host", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn("STEEL_REMOTE_HOST/v1", proof_text)
        self.assertNotIn("Bearer ", proof_text)
        proof = proof_response.json()
        remote_goal = next(goal for goal in proof["goals"] if goal["key"] == "hosted_browser_sandbox_provider_steel_remote_host")
        remote_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_steel_remote_host")
        remote_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_steel_remote_host")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(remote_goal["status"], "steel_remote_host_contract_ready_waiting_live_10_of_10")
        self.assertEqual(remote_check["status"], "steel_remote_host_contract_ready_waiting_live_10_of_10")
        self.assertTrue(remote_check["contractReady"])
        self.assertFalse(remote_check["ok"])
        self.assertEqual(remote_score["score"], 0)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_remote_readiness_requires_phase30_steel_remote_artifact(self):
        fake_endpoint = "https://steel-remote.invalid"
        fake_token = "test-token-that-must-not-leak"
        with tempfile.TemporaryDirectory() as tmp:
            config_path = os.path.join(tmp, "browser-sandbox-provider.runtime.json")
            visual_path = os.path.join(tmp, "visual-ocr-proof.json")
            with open("project/deployment/browser-sandbox-provider.hosted-provider.example.json", "r", encoding="utf-8") as handle:
                config = json.load(handle)
            config["adapter"]["providerLiveConnected"] = True
            with open(config_path, "w", encoding="utf-8") as handle:
                json.dump(config, handle)
            with open(visual_path, "w", encoding="utf-8") as handle:
                json.dump(self.valid_visual_ocr_manifest(), handle)
            with patch.dict(os.environ, {
                "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": config_path,
                "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
                "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
                "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE": visual_path,
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_REMOTE_PROOF_FILE": os.path.join(tmp, "missing-steel-remote-proof.json")
            }, clear=True):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                headers = self.bearer_headers("v1_steel_remote_gate_user")
                proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-steel-remote-required", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        private_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_private_launch_execution")
        remote_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_steel_remote_host")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(private_score["score"], 100)
        self.assertEqual(remote_score["score"], 0)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_live_preflight_never_overclaims_live_provider(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
            "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_live_preflight_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-live-preflight", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        live_preflight_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_live_preflight")
        live_preflight_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_live_preflight")
        live_verification_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_live_verification")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(live_preflight_check["status"], "hosted_browser_sandbox_provider_live_preflight_ready")
        self.assertTrue(live_preflight_check["resolverReady"])
        self.assertTrue(live_preflight_check["selectionPreflightReady"])
        self.assertEqual(live_preflight_score["score"], 80)
        self.assertEqual(live_verification_score["score"], 0)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_live_verification_is_separate_from_hosted_ready(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
            "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_live_verification_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-live-verification", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        live_verification_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_live_verification")
        live_verification_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_live_verification")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(live_verification_check["status"], "hosted_browser_sandbox_provider_live_verification_ready")
        self.assertTrue(live_verification_check["livePreflightReady"])
        self.assertEqual(live_verification_score["score"], 100)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_webrtc_signaling_is_separate_from_hosted_ready(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
            "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY": "1"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_webrtc_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-webrtc-signaling", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        webrtc_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_webrtc_signaling")
        webrtc_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_webrtc_signaling")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(webrtc_check["status"], "hosted_browser_sandbox_provider_webrtc_signaling_ready")
        self.assertTrue(webrtc_check["streamRequiresWebrtc"])
        self.assertEqual(webrtc_score["score"], 100)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_visual_ocr_replay_is_separate_from_hosted_ready(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        proof_manifest = {
            "schemaVersion": "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1",
            "providerLiveConnected": True,
            "session": {"sessionRefPresent": True, "rawSessionRefReturned": False},
            "stream": {"frameRefPresent": True, "rawFrameReturned": False, "rawFramePersisted": False},
            "screenshot": {"screenshotRefPresent": True, "rawImageReturned": False},
            "ocrCaption": {
                "captionRefPresent": True,
                "rawOcrTextReturned": False,
                "rawOcrTextPersisted": False,
                "visualCaptionSafe": True
            },
            "takeover": {"approvalRequired": True, "inputRelay": "approval_gated_human_only"},
            "input": {"rawInputReturned": False, "externalWriteActionsWithoutApproval": False},
            "teardown": {"teardownComplete": True, "rawFramePersisted": False, "rawOcrTextPersisted": False},
            "visualProof": {
                "dashboardScreenshotRefPresent": True,
                "mobileLiveBlockRefPresent": True,
                "ocrCaptionRefPresent": True
            },
            "safety": {
                "agentCredentialEntryAllowed": False,
                "externalWriteActionsWithoutApproval": False,
                "rawEndpointReturned": False,
                "rawSecretReturned": False
            }
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(proof_manifest, handle)
            proof_path = handle.name
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
            "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE": proof_path
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_visual_ocr_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-visual-ocr-replay", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        self.assertNotIn(proof_path, proof_text)
        proof = proof_response.json()
        visual_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_visual_ocr_replay")
        visual_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_visual_ocr_replay")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(visual_check["status"], "hosted_browser_sandbox_provider_visual_ocr_replay_ready")
        self.assertTrue(visual_check["proofFilePresent"])
        self.assertTrue(visual_check["proofFileOutsideGit"])
        self.assertTrue(visual_check["proofValidationOk"])
        self.assertEqual(visual_score["score"], 100)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_launch_readiness_is_visible_without_overclaiming(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
            "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
            "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json"
        }, clear=True):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = self.bearer_headers("v1_hosted_provider_launch_readiness_user")
            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-launch-readiness", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        proof = proof_response.json()
        launch_goal = next(goal for goal in proof["goals"] if goal["key"] == "hosted_browser_sandbox_provider_launch_readiness")
        launch_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_launch_readiness")
        launch_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_launch_readiness")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(launch_goal["status"], "hosted_browser_sandbox_provider_launch_runbook_ready")
        self.assertEqual(launch_check["status"], "hosted_browser_sandbox_provider_launch_runbook_ready")
        self.assertTrue(launch_check["runbookReady"])
        self.assertFalse(launch_check["privateProofChainReady"])
        self.assertFalse(launch_check["finalEnablementAllowed"])
        self.assertIn("private_provider_config_outside_git", launch_check["missing"])
        self.assertEqual(launch_score["score"], 60)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_provider_private_launch_execution_requires_final_review(self):
        fake_endpoint = "https://sandbox-provider.invalid/api"
        fake_token = "test-token-that-must-not-leak"
        proof_manifest = {
            "schemaVersion": "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1",
            "providerLiveConnected": True,
            "session": {"sessionRefPresent": True, "rawSessionRefReturned": False},
            "stream": {"frameRefPresent": True, "rawFrameReturned": False, "rawFramePersisted": False},
            "screenshot": {"screenshotRefPresent": True, "rawImageReturned": False},
            "ocrCaption": {
                "captionRefPresent": True,
                "rawOcrTextReturned": False,
                "rawOcrTextPersisted": False,
                "visualCaptionSafe": True
            },
            "takeover": {"approvalRequired": True, "inputRelay": "approval_gated_human_only"},
            "input": {"rawInputReturned": False, "externalWriteActionsWithoutApproval": False},
            "teardown": {"teardownComplete": True, "rawFramePersisted": False, "rawOcrTextPersisted": False},
            "visualProof": {
                "dashboardScreenshotRefPresent": True,
                "mobileLiveBlockRefPresent": True,
                "ocrCaptionRefPresent": True
            },
            "safety": {
                "agentCredentialEntryAllowed": False,
                "externalWriteActionsWithoutApproval": False,
                "rawEndpointReturned": False,
                "rawSecretReturned": False
            }
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            proof_path = os.path.join(tmpdir, "provider-visual-ocr-proof.json")
            config_path = os.path.join(tmpdir, "browser-sandbox-provider.runtime.json")
            with open("project/deployment/browser-sandbox-provider.hosted-provider.example.json", "r", encoding="utf-8") as handle:
                config = json.load(handle)
            config["adapter"]["providerLiveConnected"] = True
            with open(config_path, "w", encoding="utf-8") as handle:
                json.dump(config, handle)
            with open(proof_path, "w", encoding="utf-8") as handle:
                json.dump(proof_manifest, handle)
            with patch.dict(os.environ, {
                "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": config_path,
                "WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL": fake_endpoint,
                "WEFELLA_BROWSER_SANDBOX_API_TOKEN": fake_token,
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE": "project/deployment/browser-sandbox-provider.selection.example.json",
                "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER": "custom_webrtc",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE": proof_path,
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED": "1",
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY": "1"
            }, clear=True):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                headers = self.bearer_headers("v1_hosted_provider_private_launch_user")
                proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-provider-private-launch-execution", headers=headers)

        self.assertEqual(proof_response.status_code, 200)
        proof_text = json.dumps(proof_response.json())
        self.assertNotIn(fake_endpoint, proof_text)
        self.assertNotIn(fake_token, proof_text)
        self.assertNotIn(config_path, proof_text)
        self.assertNotIn(proof_path, proof_text)
        proof = proof_response.json()
        private_check = next(check for check in proof["checks"] if check["key"] == "hosted_browser_sandbox_provider_private_launch_execution")
        private_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_private_launch_execution")
        launch_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_provider_launch_readiness")
        hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
        self.assertEqual(private_check["status"], "hosted_browser_sandbox_provider_private_launch_execution_blocked")
        self.assertTrue(private_check["executionGate"])
        self.assertFalse(private_check["finalHumanReviewed"])
        self.assertTrue(private_check["privateProofChainReady"])
        self.assertTrue(private_check["finalEnablementAllowed"])
        self.assertIn("final_human_review", private_check["missing"])
        self.assertEqual(private_score["score"], 0)
        self.assertEqual(launch_score["score"], 100)
        self.assertEqual(hosted_score["score"], 0)

    def test_hosted_browser_sandbox_webrtc_offer_route_sanitizes_provider_response(self):
        from project.api.browser_sandbox import HostedRemoteBrowserSandboxProvider

        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        user_id = "v1_hosted_provider_webrtc_route_user"
        headers = self.bearer_headers(user_id)
        browser_session_id = "hosted_browser_webrtc_route"
        app.state.browser_sessions[browser_session_id] = {
            "browser_session_id": browser_session_id,
            "provider": "hosted_remote",
            "adapter_mode": "hosted_provider",
            "provider_live_connected": True,
            "provider_session_ref": "provider-live-session-ref-redacted",
            "provider_paths": {
                "webrtc_offer": "browser/sessions/provider-live-session-ref-redacted/webrtc/offer",
                "webrtc_ice_candidate": "browser/sessions/provider-live-session-ref-redacted/webrtc/ice-candidate"
            },
            "session_id": "session_webrtc_route",
            "user_id": user_id,
            "takeover_state": "not_requested"
        }

        async def fake_provider_json(_provider, *, path, method="POST", body=None):
            self.assertNotIn("v=0", json.dumps(body or {}))
            self.assertNotIn("candidate:", json.dumps(body or {}))
            if path.endswith("/webrtc/offer"):
                return {
                    "status_code": 200,
                    "payload": {
                        "status": "webrtc_signaling_answer_ready",
                        "transport": "webrtc",
                        "answerRef": "provider-sdp-answer-ref-redacted",
                        "iceServerRefs": ["provider-ice-server-ref-redacted"],
                        "rawSdpReturned": False,
                        "rawIceCandidateReturned": False,
                        "providerLiveConnected": True
                    }
                }
            if path.endswith("/webrtc/ice-candidate"):
                return {
                    "status_code": 200,
                    "payload": {
                        "status": "webrtc_ice_candidate_relayed",
                        "candidateAccepted": True,
                        "rawIceCandidateReturned": False,
                        "providerLiveConnected": True
                    }
                }
            return {"status_code": 404, "payload": {}}

        with patch.object(HostedRemoteBrowserSandboxProvider, "_provider_json", fake_provider_json):
            response = client.post(
                f"/api/v1/browser/sessions/{browser_session_id}/webrtc/offer",
                headers=headers,
                json={
                    "offer_ref": "client-sdp-offer-ref-redacted",
                    "ice_candidate_ref": "client-ice-candidate-ref-redacted"
                }
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        serialized = json.dumps(payload)
        self.assertEqual(payload["status"], "webrtc_signaling_answer_ready")
        self.assertTrue(payload["answerRefPresent"])
        self.assertTrue(payload["iceServerRefsPresent"])
        self.assertTrue(payload["candidateAccepted"])
        self.assertFalse(payload["rawSdpReturned"])
        self.assertFalse(payload["rawIceCandidateReturned"])
        self.assertNotIn("v=0", serialized)
        self.assertNotIn("candidate:", serialized)
        self.assertNotIn("provider-sdp-answer-ref-redacted", serialized)

    def test_hosted_browser_sandbox_adapter_harness_lifecycle_is_safe_and_sanitized(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.bearer_headers("v1_hosted_harness_user")
        harness_config = "project/deployment/browser-sandbox-provider.contract-harness.json"

        with patch.dict(os.environ, {
            "WEFELLA_BROWSER_SANDBOX_PROVIDER": "hosted_remote",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY": "1",
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE": harness_config
        }, clear=False):
            browser_response = client.post(
                "/api/v1/browser/sessions",
                headers=headers,
                json={
                    "session_id": "session_hosted_harness",
                    "target_url": "https://health.aetna.com/member",
                    "provider": "hosted_remote"
                }
            )
            self.assertEqual(browser_response.status_code, 200)
            browser = browser_response.json()
            self.assertEqual(browser["provider"], "hosted_remote")
            self.assertEqual(browser["readiness"]["status"], "hosted_browser_sandbox_adapter_harness_ready")
            self.assertEqual(browser["readiness"]["adapterMode"], "contract_harness")
            self.assertFalse(browser["readiness"]["providerLiveConnected"])
            self.assertFalse(browser["ocr_caption"]["rawOcrTextReturned"])
            self.assertEqual(browser["screencast"]["status"], "hosted_adapter_harness_session_created")

            stream_response = client.get(browser["stream_url"], headers=headers)
            self.assertEqual(stream_response.status_code, 200)
            self.assertIn("hosted.sandbox.contract_frame", stream_response.text)
            self.assertIn('"rawOcrTextReturned":false', stream_response.text)

            takeover_response = client.post(
                f"/api/v1/browser/sessions/{browser['browser_session_id']}/takeover",
                headers=headers,
                json={"mode": "request", "reason": "user_password_or_captcha"}
            )
            self.assertEqual(takeover_response.status_code, 200)
            takeover = takeover_response.json()
            self.assertEqual(takeover["status"], "interactive_takeover_pending_approval")
            self.assertFalse(takeover["providerLiveConnected"])

            grant_response = client.post(
                f"/api/v1/browser/sessions/{browser['browser_session_id']}/takeover",
                headers=headers,
                json={"mode": "grant", "takeover_id": takeover["takeoverId"], "approved_by": "user"}
            )
            self.assertEqual(grant_response.status_code, 200)
            grant = grant_response.json()
            self.assertTrue(grant["grantToken"].startswith("hosted_grant_"))

            input_response = client.post(
                f"/api/v1/browser/sessions/{browser['browser_session_id']}/input",
                headers=headers,
                json={
                    "takeover_id": takeover["takeoverId"],
                    "grant_token": grant["grantToken"],
                    "input": {"type": "key", "key": "Tab", "text": "should_not_be_returned"}
                }
            )
            self.assertEqual(input_response.status_code, 200)
            input_result = input_response.json()
            self.assertTrue(input_result["inputAccepted"])
            self.assertFalse(input_result["rawInputReturned"])
            self.assertNotIn("should_not_be_returned", json.dumps(input_result))

            end_response = client.post(
                f"/api/v1/browser/sessions/{browser['browser_session_id']}/takeover",
                headers=headers,
                json={"mode": "end", "takeover_id": takeover["takeoverId"]}
            )
            self.assertEqual(end_response.status_code, 200)
            self.assertEqual(end_response.json()["status"], "interactive_takeover_ended")

            proof_response = client.get("/api/v1/proof/runs/hosted-browser-sandbox-adapter-harness", headers=headers)
            self.assertEqual(proof_response.status_code, 200)
            proof = proof_response.json()
            harness_score = next(score for score in proof["scores"] if score["key"] == "hosted_browser_sandbox_adapter_harness")
            hosted_score = next(score for score in proof["scores"] if score["key"] == "hosted_remote_browser_sandbox")
            self.assertEqual(harness_score["score"], 75)
            self.assertEqual(harness_score["status"], "hosted_browser_sandbox_adapter_harness_ready")
            self.assertEqual(hosted_score["score"], 0)

    def test_upload_requires_bearer_token(self):
        response = self.client.post(
            "/api/uploads",
            json={
                "filename": "benefits.txt",
                "content_type": "text/plain",
                "content_base64": base64.b64encode(b"Summary of Benefits").decode("ascii")
            }
        )
        self.assertEqual(response.status_code, 401)

    def test_text_upload_extracts_safe_fields_and_preview(self):
        document_text = (
            "Summary of Benefits and Coverage\n"
            "Member ID: ABCD-1234-9999\n"
            "Email jane@example.com\n"
            "SSN 123-45-6789\n"
            "Deductible $1,500 effective 01/01/2026\n"
            "Out-of-pocket max $7,000\n"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"WEFELLA_UPLOAD_STORE_PATH": tmpdir}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                response = client.post(
                    "/api/uploads",
                    headers=self.headers,
                    json={
                        "filename": "../benefits.txt",
                        "content_type": "text/plain; charset=utf-8",
                        "content_base64": base64.b64encode(document_text.encode("utf-8")).decode("ascii"),
                        "session_id": "session_facade_local",
                        "document_kind": "benefits"
                    }
                )
                self.assertEqual(response.status_code, 200)
                body = response.json()
                extraction_response = client.get(
                    f"/api/uploads/{body['upload_id']}/extraction",
                    headers=self.headers
                )

        self.assertEqual(body["status"], "stored")
        self.assertEqual(body["filename"], "benefits.txt")
        self.assertEqual(body["content_type"], "text/plain")
        self.assertEqual(body["extraction"]["status"], "completed")
        preview = body["extraction"]["safe_text_preview"]
        self.assertIn("[redacted-email]", preview)
        self.assertIn("[redacted-ssn]", preview)
        self.assertIn("last4:9999", preview)
        self.assertNotIn("jane@example.com", preview)
        self.assertNotIn("123-45-6789", preview)
        field_labels = {item["label"] for item in body["extraction"]["fields"]}
        self.assertIn("document_type", field_labels)
        self.assertIn("deductible", field_labels)
        self.assertIn("amount", field_labels)
        self.assertEqual(extraction_response.status_code, 200)
        self.assertEqual(extraction_response.json()["upload_id"], body["upload_id"])

    def test_upload_rejects_invalid_type_and_size(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"WEFELLA_UPLOAD_STORE_PATH": tmpdir, "WEFELLA_UPLOAD_MAX_BYTES": "12"}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                invalid_type = client.post(
                    "/api/uploads",
                    headers=self.headers,
                    json={
                        "filename": "script.html",
                        "content_type": "text/html",
                        "content_base64": base64.b64encode(b"<html></html>").decode("ascii")
                    }
                )
                too_large = client.post(
                    "/api/uploads",
                    headers=self.headers,
                    json={
                        "filename": "benefits.txt",
                        "content_type": "text/plain",
                        "content_base64": base64.b64encode(b"this is larger than twelve bytes").decode("ascii")
                    }
                )

        self.assertEqual(invalid_type.status_code, 400)
        self.assertEqual(too_large.status_code, 413)

    def test_upload_extraction_is_bound_to_jwt_subject(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"WEFELLA_UPLOAD_STORE_PATH": tmpdir}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                upload = client.post(
                    "/api/uploads",
                    headers=self.headers,
                    json={
                        "filename": "claim.txt",
                        "content_type": "text/plain",
                        "content_base64": base64.b64encode(b"Explanation of Benefits Claim Number CLM12345 Amount $25.00").decode("ascii")
                    }
                )
                self.assertEqual(upload.status_code, 200)
                mismatch = client.get(
                    f"/api/uploads/{upload.json()['upload_id']}/extraction",
                    headers={"Authorization": f"Bearer {create_access_token('other_user')}"}
                )

        self.assertEqual(mismatch.status_code, 403)

    def test_chat_attaches_owned_uploaded_document_extraction_to_langgraph(self):
        document_text = "Explanation of Benefits Claim Number CLM12345 Amount $25.00 Member ID XYZ-7788"
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"WEFELLA_UPLOAD_STORE_PATH": tmpdir}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                upload = client.post(
                    "/api/uploads",
                    headers=self.headers,
                    json={
                        "filename": "eob.txt",
                        "content_type": "text/plain",
                        "content_base64": base64.b64encode(document_text.encode("utf-8")).decode("ascii"),
                        "session_id": "session_facade_local"
                    }
                )
                self.assertEqual(upload.status_code, 200)
                result = self.submit_chat_and_wait(
                    client,
                    self.headers,
                    {
                        "user_id": self.user_id,
                        "session_id": "session_facade_local",
                        "message": "Can you explain this uploaded EOB?",
                        "uploaded_document_ids": [upload.json()["upload_id"]]
                    }
                )

        self.assertEqual(result["graphRun"]["state"]["uploaded_document_context"]["documentCount"], 1)
        uploaded_documents = app.state.node_client.last_uploaded_documents
        self.assertEqual(uploaded_documents[0]["uploadId"], upload.json()["upload_id"])
        self.assertEqual(uploaded_documents[0]["extraction"]["status"], "completed")
        self.assertIn("fields", uploaded_documents[0]["extraction"])
        self.assertNotIn("content_base64", json.dumps(uploaded_documents))

    def test_readiness_degrades_when_node_runtime_is_unreachable(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeUnavailableNodeRuntimeClient()
        client = TestClient(app)
        response = client.get("/api/readiness")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertFalse(body["checks"]["node_runtime"]["ok"])
        self.assertEqual(body["checks"]["node_runtime"]["severity"], "error")

    def test_chat_requires_bearer_token(self):
        response = self.client.post("/api/chat", headers={"x-request-id": "req_facade_test"}, json={"user_id": self.user_id, "message": "Hello"})
        self.assertEqual(response.status_code, 401)
        body = response.json()
        self.assertEqual(body["detail"], "Bearer token required.")
        self.assertEqual(body["error"]["code"], "unauthorized")
        self.assertEqual(body["error"]["request_id"], "req_facade_test")
        self.assertEqual(response.headers["x-request-id"], "req_facade_test")

    def test_validation_error_envelope_does_not_echo_raw_input(self):
        raw_identifier = "Jane Patient jane@example.com 123-45-6789"
        response = self.client.post(
            "/api/chat",
            headers=self.headers,
            json={"user_id": self.user_id, "message": raw_identifier, "payload_mode": 7}
        )
        self.assertEqual(response.status_code, 422)
        body = response.json()
        self.assertEqual(body["error"]["code"], "validation_error")
        self.assertNotIn(raw_identifier, json.dumps(body))

    def test_chat_rejects_user_mismatch(self):
        response = self.client.post(
            "/api/chat",
            headers=self.headers,
            json={"user_id": "other_user", "message": "Hello"}
        )
        self.assertEqual(response.status_code, 403)

    def test_health_reports_provider_auth_without_secrets(self):
        provider_env = {
            "WEFELLA_AUTH_MODE": "provider",
            "WEFELLA_JWT_SECRET": "provider-test-secret",
            "WEFELLA_JWT_ISSUER": "https://issuer.example.test",
            "WEFELLA_JWT_AUDIENCE": "brainstyworkers-api",
            "WEFELLA_ENABLE_LOCAL_AUTH": "0"
        }
        with patch.dict(os.environ, provider_env, clear=False):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            response = client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        auth = response.json()["auth"]
        self.assertEqual(auth["mode"], "provider")
        self.assertTrue(auth["provider_claims_required"])
        self.assertTrue(auth["issuer_configured"])
        self.assertTrue(auth["audience_configured"])
        self.assertFalse(auth["local_auth_enabled"])
        self.assertNotIn("provider-test-secret", str(auth))

    def test_provider_auth_rejects_local_dev_token_without_issuer_and_audience(self):
        provider_env = {
            "WEFELLA_AUTH_MODE": "provider",
            "WEFELLA_JWT_SECRET": "provider-test-secret",
            "WEFELLA_JWT_ISSUER": "https://issuer.example.test",
            "WEFELLA_JWT_AUDIENCE": "brainstyworkers-api",
            "WEFELLA_ENABLE_LOCAL_AUTH": "0"
        }
        with patch.dict(os.environ, provider_env, clear=False):
            token = create_access_token("provider_user")
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            response = client.post(
                "/api/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"user_id": "provider_user", "session_id": "session_provider", "message": "Hello"}
            )
            local_auth = client.post(
                "/api/auth/local-session",
                json={"member": {"email": "provider@example.com", "name": "Provider User"}}
            )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(local_auth.status_code, 403)

    def test_provider_auth_accepts_matching_issuer_and_audience(self):
        provider_env = {
            "WEFELLA_AUTH_MODE": "provider",
            "WEFELLA_JWT_SECRET": "provider-test-secret",
            "WEFELLA_JWT_ISSUER": "https://issuer.example.test",
            "WEFELLA_JWT_AUDIENCE": "brainstyworkers-api",
            "WEFELLA_ENABLE_LOCAL_AUTH": "0"
        }
        with patch.dict(os.environ, provider_env, clear=False):
            token = create_access_token(
                "provider_user",
                extra_claims={"iss": "https://issuer.example.test", "aud": "brainstyworkers-api"}
            )
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            response = client.post(
                "/api/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "user_id": "provider_user",
                    "session_id": "session_provider",
                    "message": "Do I still owe anything before insurance starts paying?"
                }
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "queued")

    def test_provider_auth_rejects_wrong_audience(self):
        provider_env = {
            "WEFELLA_AUTH_MODE": "provider",
            "WEFELLA_JWT_SECRET": "provider-test-secret",
            "WEFELLA_JWT_ISSUER": "https://issuer.example.test",
            "WEFELLA_JWT_AUDIENCE": "brainstyworkers-api",
            "WEFELLA_ENABLE_LOCAL_AUTH": "0"
        }
        with patch.dict(os.environ, provider_env, clear=False):
            token = create_access_token(
                "provider_user",
                extra_claims={"iss": "https://issuer.example.test", "aud": "other-api"}
            )
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            response = client.post(
                "/api/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"user_id": "provider_user", "session_id": "session_provider", "message": "Hello"}
            )
        self.assertEqual(response.status_code, 401)

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

        operator_only = client.get(
            "/api/research/kpis",
            headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        self.assertEqual(operator_only.status_code, 403)

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

    def test_chat_forwards_approved_live_loop_options_to_node(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
        result = self.submit_chat_and_wait(
            client,
            headers,
            {
                "user_id": "user_facade_local",
                "session_id": "session_facade_local",
                "message": "Do I still owe anything before insurance starts paying?",
                "execute_evidence_observation": True,
                "require_live_portal_proof": True,
                "use_official_openclaw_worker": True,
                "official_openclaw_use_current_tab": True,
                "official_openclaw_multi_page": True,
                "approval_token": "approval_test_token",
                "approval_task_id": "task_approval_gate",
                "worker_continuation_id": "cont_worker_loop",
                "approval_scope": "read_only_observation",
                "allowed_action": "read_only_observation",
                "approved_document_candidate_id": "candidate_document_one"
            }
        )

        self.assertIn("graphRun", result)
        forwarded = app.state.node_client.last_chat
        self.assertTrue(forwarded.execute_evidence_observation)
        self.assertTrue(forwarded.require_live_portal_proof)
        self.assertTrue(forwarded.use_official_openclaw_worker)
        self.assertTrue(forwarded.official_openclaw_use_current_tab)
        self.assertTrue(forwarded.official_openclaw_multi_page)
        self.assertEqual(forwarded.approval_token, "approval_test_token")
        self.assertEqual(forwarded.approval_task_id, "task_approval_gate")
        self.assertEqual(forwarded.worker_continuation_id, "cont_worker_loop")
        self.assertEqual(forwarded.approval_scope, "read_only_observation")
        self.assertEqual(forwarded.allowed_action, "read_only_observation")
        self.assertEqual(forwarded.approved_document_candidate_id, "candidate_document_one")
        self.assertEqual(result["facade"]["sourceGrounding"]["status"], "needs_source_or_blocker")
        self.assertFalse(result["facade"]["sourceGrounding"]["ok"])

    def test_rate_limit_returns_standard_error_envelope(self):
        with patch.dict(os.environ, {"WEFELLA_RATE_LIMIT_PER_MINUTE": "1"}, clear=False):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}

            first = client.post(
                "/api/chat",
                headers=headers,
                json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": "Hello"}
            )
            second = client.post(
                "/api/chat",
                headers=headers,
                json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": "Hello again"}
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        body = second.json()
        self.assertEqual(body["detail"], "Rate limit exceeded.")
        self.assertEqual(body["error"]["code"], "rate_limited")
        self.assertEqual(body["error"]["details"]["limit"], 1)

    def test_task_registry_can_persist_completed_task_locally(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage_path = os.path.join(tmpdir, "tasks.json")
            with patch.dict(os.environ, {"WEFELLA_TASK_REGISTRY_PATH": storage_path}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
                accepted = client.post(
                    "/api/chat",
                    headers=headers,
                    json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": "Hello"}
                )
                self.assertEqual(accepted.status_code, 200)
                task_id = accepted.json()["task_id"]

                restarted_app = create_app(inline_tasks=True)
                restarted_app.state.node_client = FakeNodeRuntimeClient()
                restarted_client = TestClient(restarted_app)
                loaded = restarted_client.get(f"/api/chat/status/{task_id}", headers=headers)
                health = restarted_client.get("/api/health")

        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.json()["status"], "completed")
        self.assertEqual(loaded.json()["result"]["graphRun"]["state"]["graph_trace_id"], "trace_facade_local")
        self.assertEqual(health.json()["task_registry"]["backend"], "json_file")

    def test_source_grounding_can_be_enforced_for_healthcare_answers(self):
        with patch.dict(os.environ, {"WEFELLA_ENFORCE_SOURCE_GROUNDING": "1"}, clear=False):
            app = create_app(inline_tasks=True)
            app.state.node_client = FakeNodeRuntimeClient()
            client = TestClient(app)
            headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
            accepted = client.post(
                "/api/chat",
                headers=headers,
                json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": "Hello"}
            )
            self.assertEqual(accepted.status_code, 200)
            status = client.get(f"/api/chat/status/{accepted.json()['task_id']}", headers=headers)

        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "failed")
        self.assertIn("Source grounding failed", status.json()["error"])

    def test_observability_export_writes_safe_task_events_without_raw_message(self):
        raw_message = "Do I still owe anything before insurance starts paying for Jane Patient jane@example.com?"
        with tempfile.TemporaryDirectory() as tmpdir:
            event_path = os.path.join(tmpdir, "facade-events.jsonl")
            with patch.dict(os.environ, {"WEFELLA_OBSERVABILITY_EVENTS_PATH": event_path}, clear=False):
                app = create_app(inline_tasks=True)
                app.state.node_client = FakeNodeRuntimeClient()
                client = TestClient(app)
                headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}
                accepted = client.post(
                    "/api/chat",
                    headers=headers,
                    json={"user_id": "user_facade_local", "session_id": "session_facade_local", "message": raw_message}
                )
                self.assertEqual(accepted.status_code, 200)

            with open(event_path, encoding="utf-8") as handle:
                events = [json.loads(line) for line in handle if line.strip()]

        self.assertEqual([event["event_type"] for event in events], ["facade.chat_task.started", "facade.chat_task.completed"])
        event_text = json.dumps(events)
        self.assertNotIn(raw_message, event_text)
        self.assertNotIn("Jane Patient", event_text)
        self.assertNotIn("jane@example.com", event_text)
        self.assertNotIn("user_facade_local", event_text)
        self.assertNotIn("session_facade_local", event_text)
        self.assertTrue(all(event.get("message_hash") for event in events))
        self.assertTrue(all(event.get("user_id_hash") for event in events))
        self.assertTrue(all(event.get("session_id_hash") for event in events))
        self.assertTrue(all(event.get("message_length") == len(raw_message) for event in events))

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

    def test_session_history_feedback_and_export_are_protected_facade_routes(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_access_token('user_facade_local')}"}

        history = client.get("/api/sessions/session_facade_local", headers=headers)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()["sourcePointerCount"], 1)
        self.assertEqual(
            app.state.node_client.get_calls[-1],
            ("/api/sessions/session_facade_local", {"userId": "user_facade_local"})
        )

        feedback = client.post(
            "/api/feedback",
            headers=headers,
            json={
                "session_id": "session_facade_local",
                "message_id": "msg_assistant",
                "task_id": "task_facade",
                "answer_hash": "hash_answer",
                "rating": "useful",
                "comment": "This answer helped.",
                "metadata": {"sourcePointerCount": 1}
            }
        )
        self.assertEqual(feedback.status_code, 200)
        self.assertEqual(feedback.json()["feedback"]["userId"], "user_facade_local")
        feedback_path, feedback_body = app.state.node_client.post_calls[-1]
        self.assertEqual(feedback_path, "/api/feedback")
        self.assertEqual(feedback_body["userId"], "user_facade_local")
        self.assertEqual(feedback_body["sessionId"], "session_facade_local")

        exported = client.get("/api/sessions/session_facade_local/export", headers=headers)
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.json()["contentType"], "text/markdown")
        self.assertIn("Latest Answer", exported.json()["content"])

    def test_feedback_requires_valid_rating_and_bearer_token(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)

        unauthorized = client.post(
            "/api/feedback",
            json={"session_id": "session_facade_local", "rating": "useful"}
        )
        self.assertEqual(unauthorized.status_code, 401)

        invalid_rating = client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {create_access_token('user_facade_local')}"},
            json={"session_id": "session_facade_local", "rating": "maybe"}
        )
        self.assertEqual(invalid_rating.status_code, 422)
        self.assertEqual(invalid_rating.json()["error"]["code"], "validation_error")

    def test_operator_research_routes_require_auth_and_delegate_with_actor_binding(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.operator_headers()

        unauthorized = client.get("/api/research/kpis")
        self.assertEqual(unauthorized.status_code, 401)

        user_token = client.get("/api/research/kpis", headers=self.bearer_headers("plain_user"))
        self.assertEqual(user_token.status_code, 403)
        self.assertEqual(user_token.json()["detail"], "Operator role required.")

        admin_kpis = client.get("/api/research/kpis", headers=self.admin_headers())
        self.assertEqual(admin_kpis.status_code, 200)
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/kpis", {"actorUserId": "admin_user"}))

        worker_status = client.get("/api/research/worker-status", headers=headers)
        self.assertEqual(worker_status.status_code, 200)
        self.assertEqual(worker_status.json()["defaultMode"], "deterministic_fetch")
        self.assertFalse(worker_status.json()["modes"]["openclaw"]["enabled"])

        handoffs = client.get("/api/handoffs?sessionId=session_operator", headers=headers)
        self.assertEqual(handoffs.status_code, 200)
        self.assertEqual(handoffs.json()["handoffs"][0]["handoffType"], "urgent_emergency")
        self.assertEqual(
            app.state.node_client.get_calls[-1],
            ("/api/handoffs", {"sessionId": "session_operator", "userId": "operator_user"})
        )

        embeddings = client.get("/api/research/embeddings/status", headers=headers)
        self.assertEqual(embeddings.status_code, 200)
        self.assertEqual(embeddings.json()["route"]["provider"], "local_tfidf")
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/embeddings/status", {"actorUserId": "operator_user"}))

        graph = client.get("/api/research/graph?limit=25", headers=headers)
        self.assertEqual(graph.status_code, 200)
        self.assertEqual(graph.json()["graph"]["summary"]["nodeCount"], 3)
        self.assertFalse(graph.json()["safety"]["rawArtifactTextReturned"])
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/graph", {"limit": "25", "actorUserId": "operator_user"}))

        graph_build = client.post("/api/research/graph/build", headers=headers, json={"limit": 25})
        self.assertEqual(graph_build.status_code, 200)
        self.assertEqual(graph_build.json()["build"]["actorUserId"], "operator_user")
        self.assertEqual(graph_build.json()["audit"]["eventType"], "research_graph_build_completed")
        self.assertEqual(app.state.node_client.post_calls[-1], ("/api/research/graph/build", {"limit": 25, "actorUserId": "operator_user"}))

        citation_closure = client.get("/api/research/citation-closure?limit=10", headers=headers)
        self.assertEqual(citation_closure.status_code, 200)
        self.assertEqual(citation_closure.json()["latest"]["actorUserId"], "operator_user")
        self.assertFalse(citation_closure.json()["safety"]["judgeCreatesEvidence"])
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/citation-closure", {"limit": "10", "actorUserId": "operator_user"}))

        evaluated = client.post(
            "/api/research/citation-closure/evaluate",
            headers=headers,
            json={"question": "What happens before coinsurance?", "answer": "The deductible applies before coinsurance."}
        )
        self.assertEqual(evaluated.status_code, 200)
        self.assertEqual(evaluated.json()["evaluation"]["actorUserId"], "operator_user")
        self.assertEqual(evaluated.json()["audit"]["eventType"], "research_claim_citation_closure_evaluated")
        self.assertEqual(
            app.state.node_client.post_calls[-1],
            (
                "/api/research/citation-closure/evaluate",
                {"question": "What happens before coinsurance?", "answer": "The deductible applies before coinsurance.", "actorUserId": "operator_user"}
            )
        )

        selected_route = client.post(
            "/api/research/embeddings/route",
            headers=headers,
            json={"provider": "local_tfidf", "dimensions": 64}
        )
        self.assertEqual(selected_route.status_code, 200)
        self.assertEqual(selected_route.json()["route"]["selectedBy"], "operator_user")
        self.assertEqual(app.state.node_client.post_calls[-1], ("/api/research/embeddings/route", {"provider": "local_tfidf", "dimensions": 64, "actorUserId": "operator_user"}))

        reindex = client.post("/api/research/embeddings/reindex", headers=headers, json={"routeKey": "default"})
        self.assertEqual(reindex.status_code, 200)
        self.assertEqual(reindex.json()["job"]["status"], "completed")
        self.assertEqual(app.state.node_client.post_calls[-1], ("/api/research/embeddings/reindex", {"routeKey": "default", "actorUserId": "operator_user"}))

        schedules = client.get("/api/research/schedules", headers=headers)
        self.assertEqual(schedules.status_code, 200)
        self.assertEqual(schedules.json()["schedules"][0]["actorUserId"], "operator_user")
        self.assertEqual(schedules.json()["dueCount"], 1)
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/schedules", {"actorUserId": "operator_user"}))

        scheduler_status = client.get("/api/research/scheduler/status", headers=headers)
        self.assertEqual(scheduler_status.status_code, 200)
        self.assertEqual(scheduler_status.json()["daemon"]["actorUserId"], "operator_user")
        self.assertEqual(scheduler_status.json()["daemon"]["runtime"]["processStatus"], "running")
        self.assertTrue(scheduler_status.json()["safety"]["onlyApprovedSchedules"])
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/scheduler/status", {"actorUserId": "operator_user"}))

        audit = client.get("/api/audit?prefix=research&limit=25", headers=headers)
        self.assertEqual(audit.status_code, 200)
        self.assertEqual(audit.json()["events"][0]["eventType"], "research_schedule_tick_run_created")
        self.assertFalse(audit.json()["safety"]["rawDetailsReturned"])
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/audit", {"prefix": "research", "limit": "25", "actorUserId": "operator_user"}))

        tick = client.post("/api/research/schedules/tick", headers=headers, json={"limit": 5})
        self.assertEqual(tick.status_code, 200)
        self.assertEqual(tick.json()["scheduler"]["processedCount"], 1)
        self.assertEqual(app.state.node_client.post_calls[-1], ("/api/research/schedules/tick", {"limit": 5, "actorUserId": "operator_user"}))

        daemon_tick = client.post("/api/research/scheduler/tick", headers=headers, json={"limit": 5})
        self.assertEqual(daemon_tick.status_code, 200)
        self.assertEqual(daemon_tick.json()["status"], "tick_completed")
        self.assertEqual(daemon_tick.json()["audit"]["eventType"], "research_scheduler_daemon_tick_completed")
        self.assertEqual(app.state.node_client.post_calls[-1], ("/api/research/scheduler/tick", {"limit": 5, "actorUserId": "operator_user"}))

        artifacts = client.get("/api/research/artifacts", headers=headers)
        self.assertEqual(artifacts.status_code, 200)
        self.assertEqual(artifacts.json()["artifacts"][0]["citationStatus"], "extracted_pending_review")
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/artifacts", {"actorUserId": "operator_user"}))

        search = client.get("/api/research/search?q=benefits", headers=headers)
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.json()["status"], "trusted_evidence_found")
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/search", {"q": "benefits", "actorUserId": "operator_user"}))

        kpis = client.get("/api/research/kpis", headers=headers)
        self.assertEqual(kpis.status_code, 200)
        self.assertEqual(kpis.json()["sources"]["approved"], 1)
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/research/kpis", {"actorUserId": "operator_user"}))

        mismatch = client.get("/api/research/runs?actorUserId=other_user", headers=headers)
        self.assertEqual(mismatch.status_code, 403)

        runs = client.get("/api/research/runs", headers=headers)
        self.assertEqual(runs.status_code, 200)
        self.assertEqual(runs.json()["runs"][0]["actorUserId"], "operator_user")

        started = client.post(
            "/api/research/runs",
            headers=headers,
            json={"sourceId": "source_one", "topic": "Benefits source review"}
        )
        self.assertEqual(started.status_code, 200)
        self.assertEqual(started.json()["run"]["actorUserId"], "operator_user")
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

        bad_start = client.post(
            "/api/research/runs",
            headers=headers,
            json={"actorUserId": "other_user", "sourceId": "source_one"}
        )
        self.assertEqual(bad_start.status_code, 403)

    def test_operator_research_source_review_run_control_and_patch_are_proxied(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.operator_headers()

        sources = client.get("/api/research/sources", headers=headers)
        self.assertEqual(sources.status_code, 200)
        self.assertEqual(sources.json()["sources"][0]["id"], "source_one")

        proposed = client.post(
            "/api/research/sources/propose",
            headers=headers,
            json={"url": "https://example.invalid/source", "title": "Operator Source One"}
        )
        self.assertEqual(proposed.status_code, 200)
        self.assertEqual(proposed.json()["source"]["proposedBy"], "operator_user")

        approved = client.post(
            "/api/research/sources/source_one/approve",
            headers=headers,
            json={"reason": "looks good"}
        )
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["source"]["approvedBy"], "operator_user")

        rejected = client.post(
            "/api/research/sources/source_one/reject",
            headers=headers,
            json={"reason": "duplicate"}
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["source"]["status"], "rejected")

        patched = client.patch(
            "/api/research/sources/source_one",
            headers=headers,
            json={"patch": {"priority": 12, "status": "approved"}}
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.json()["source"]["priority"], 12)
        self.assertEqual(app.state.node_client.patch_calls[-1][1]["actorUserId"], "operator_user")

        detail = client.get("/api/research/runs/run_one", headers=headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["run"]["id"], "run_one")

        events = client.get("/api/research/runs/run_one/events", headers=headers)
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.json()["events"][0]["eventType"], "research_run_queued")

        cancelled = client.post(
            "/api/research/runs/run_one/cancel",
            headers=headers,
            json={"reason": "operator cancelled"}
        )
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["run"]["status"], "cancelled")

        retried = client.post(
            "/api/research/runs/run_one/retry",
            headers=headers,
            json={"reason": "retry source"}
        )
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()["run"]["retryOfRunId"], "run_one")

        executed = client.post(
            "/api/research/runs/run_one/execute",
            headers=headers,
            json={"workerMode": "deterministic_fetch"}
        )
        self.assertEqual(executed.status_code, 200)
        self.assertEqual(executed.json()["run"]["status"], "completed")
        self.assertEqual(executed.json()["artifact"]["citationStatus"], "extracted_pending_review")
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

        adaptive = client.post(
            "/api/research/runs/run_one/execute",
            headers=headers,
            json={"workerMode": "openclaw", "approvedWorkerDispatch": True}
        )
        self.assertEqual(adaptive.status_code, 200)
        self.assertEqual(adaptive.json()["workerResult"]["status"], "success")
        self.assertTrue(app.state.node_client.post_calls[-1][1]["approvedWorkerDispatch"])

        reviewed = client.post(
            "/api/research/artifacts/artifact_one/review",
            headers=headers,
            json={"decision": "approve", "reason": "reviewed as grounded"}
        )
        self.assertEqual(reviewed.status_code, 200)
        self.assertEqual(reviewed.json()["artifact"]["citationStatus"], "trusted_retrieval_approved")
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

    def test_operator_assistant_routes_require_operator_and_delegate_with_actor_binding(self):
        app = create_app(inline_tasks=True)
        app.state.node_client = FakeNodeRuntimeClient()
        client = TestClient(app)
        headers = self.operator_headers()

        unauthorized = client.post("/api/operator/assistant", json={"message": "propose source https://example.invalid/source"})
        self.assertEqual(unauthorized.status_code, 401)

        plain_user = client.get("/api/operator/tools", headers=self.bearer_headers("plain_user"))
        self.assertEqual(plain_user.status_code, 403)
        self.assertEqual(plain_user.json()["detail"], "Operator role required.")

        tools = client.get("/api/operator/tools", headers=headers)
        self.assertEqual(tools.status_code, 200)
        self.assertEqual(tools.json()["tools"][0]["key"], "research.searchEvidence")
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/operator/tools", {"actorUserId": "operator_user"}))

        assistant = client.post(
            "/api/operator/assistant",
            headers=headers,
            json={"message": "please propose source https://example.invalid/source"}
        )
        self.assertEqual(assistant.status_code, 200)
        self.assertEqual(assistant.json()["proposal"]["actorUserId"], "operator_user")
        self.assertEqual(assistant.json()["actionsTaken"], [])
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

        mismatch = client.post(
            "/api/operator/assistant",
            headers=headers,
            json={"actorUserId": "other_user", "message": "please propose source https://example.invalid/source"}
        )
        self.assertEqual(mismatch.status_code, 403)

        proposals = client.get("/api/operator/proposals", headers=headers)
        self.assertEqual(proposals.status_code, 200)
        self.assertEqual(proposals.json()["proposals"][0]["actorUserId"], "operator_user")
        self.assertEqual(app.state.node_client.get_calls[-1], ("/api/operator/proposals", {"actorUserId": "operator_user"}))

        approved = client.post(
            "/api/operator/proposals/operator_proposal_one/approve",
            headers=headers,
            json={"reason": "approved by operator"}
        )
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["proposal"]["executionCount"], 1)
        self.assertEqual(approved.json()["actionsTaken"], ["research.proposeSource"])
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

        rejected = client.post(
            "/api/operator/proposals/operator_proposal_one/reject",
            headers=headers,
            json={"reason": "duplicate"}
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["actionsTaken"], [])
        self.assertEqual(app.state.node_client.post_calls[-1][1]["actorUserId"], "operator_user")

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
        result = self.wait_for_task(self.client, self.headers, accepted["task_id"])
        self.assertIn("graphRun", result)

    @unittest.skipUnless(os.getenv("WEFELLA_TEST_NODE_LIVE") == "1", "Set WEFELLA_TEST_NODE_LIVE=1 with the Node runtime running.")
    def test_approved_loop_delegates_to_real_node_runtime_with_sources_or_blocker(self):
        stamp = int(time.time() * 1000)
        member = {
            "name": "Phase 9F Tester",
            "email": f"phase9f-{stamp}@example.com",
            "payer": "Aetna",
            "portalUrl": "https://www.aetna.com/"
        }
        auth = self.client.post(
            "/api/auth/local-session",
            json={"member": member, "resume_latest_session": False}
        )
        self.assertEqual(auth.status_code, 200)
        auth_body = auth.json()
        headers = {"Authorization": f"Bearer {auth_body['access_token']}"}
        user_id = auth_body["user_id"]
        session_id = auth_body["session_id"]

        proposal = self.submit_chat_and_wait(
            self.client,
            headers,
            {
                "user_id": user_id,
                "session_id": session_id,
                "member": member,
                "message": "Do I still owe anything before insurance starts paying?",
                "execute_evidence_observation": False,
                "require_live_portal_proof": False,
                "use_official_openclaw_worker": False,
                "use_live_model": False
            }
        )
        approval_task_id = proposal["graphRun"]["state"]["openclaw_skill_proposal"]["task"]["id"]
        trace_id = proposal["graphRun"]["state"].get("graph_trace_id")

        continuation = self.client.post(
            "/api/worker-continuations",
            headers=headers,
            json={
                "taskId": approval_task_id,
                "sessionId": session_id,
                "approvalScope": "read_only_observation",
                "allowedAction": "read_only_observation",
                "correlationId": trace_id,
                "reportEverySeconds": 30
            }
        )
        self.assertEqual(continuation.status_code, 200)
        continuation_id = continuation.json()["continuation"]["id"]

        approval = self.client.post(
            "/api/orchestrator/approve",
            headers=headers,
            json={
                "taskId": approval_task_id,
                "sessionId": session_id,
                "approvalScope": "read_only_observation",
                "allowedAction": "read_only_observation",
                "expiresInMinutes": 15
            }
        )
        self.assertEqual(approval.status_code, 200)
        approval_body = approval.json()
        self.assertEqual(approval_body["status"], "approved")

        result = self.submit_chat_and_wait(
            self.client,
            headers,
            {
                "user_id": user_id,
                "session_id": session_id,
                "member": member,
                "message": "Do I still owe anything before insurance starts paying?",
                "execute_evidence_observation": True,
                "require_live_portal_proof": True,
                "use_official_openclaw_worker": True,
                "official_openclaw_use_current_tab": True,
                "official_openclaw_multi_page": True,
                "approval_token": approval_body["approvalToken"],
                "approval_task_id": approval_task_id,
                "worker_continuation_id": continuation_id,
                "use_live_model": False
            }
        )
        state = result["graphRun"]["state"]
        evidence = state.get("evidence_observation") or {}
        source_pointers = state.get("source_pointers") or []
        blocker = evidence.get("blocker") or evidence.get("reason") or evidence.get("error")
        memory = state.get("product_memory_retain") or {}

        self.assertIn(state.get("approval_resume", {}).get("status"), {"approval_consumed", "approved_consumed"})
        self.assertTrue(source_pointers or blocker, "approved loop must return source pointers or a precise blocker")
        self.assertIn("status", evidence)
        self.assertTrue(memory, "Graphiti/product-memory retain status must be present even when disabled or blocked")
        actions = " ".join(evidence.get("actionsTaken", []))
        self.assertNotRegex(actions, r"credential|password|2fa|submit|payer_contact|external_message")


if __name__ == "__main__":
    unittest.main()
