import { checkOfficialOpenClawReadiness, getOfficialOpenClawConfig } from "../openclawOfficialRuntime.mjs";
import { classifyOfficialOpenClawLiveReadiness } from "../openclawLiveReadiness.mjs";
import { loadOpenClawSkillRegistry } from "./skillRegistry.mjs";

export const OPENCLAW_PROFILE_READINESS_VERSION = "2026-06-15.openclaw-profile-readiness.v1";

export async function checkOpenClawProfileReadiness(options = {}) {
  const config = options.config ?? getOfficialOpenClawConfig();
  const [runtime, registry] = await Promise.all([
    checkOfficialOpenClawReadiness({ config }),
    loadOpenClawSkillRegistry(options)
  ]);
  const live = classifyOfficialOpenClawLiveReadiness(runtime);
  const validSkillCount = registry.skills.filter((skill) => skill.validation.valid).length;
  return {
    version: OPENCLAW_PROFILE_READINESS_VERSION,
    ready: Boolean(runtime.ready && validSkillCount > 0),
    runtime,
    liveReadiness: live,
    skills: {
      count: registry.skills.length,
      validCount: validSkillCount,
      invalid: registry.skills.filter((skill) => !skill.validation.valid).map((skill) => ({ skillKey: skill.skillKey, issues: skill.validation.issues }))
    }
  };
}

