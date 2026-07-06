import logging

logger = logging.getLogger("startup")


def _patch_scheduler_endpoint():
    import api
    from common.deps import require_auth
    from common.store import create_store
    from fastapi import Depends, HTTPException
    from scheduler.generator import generate_schedule
    from scheduler.models import ScheduleOutput, ScheduleRequest

    schedule_store = create_store("ploutos-schedule")

    @api.app.post("/scheduler/generate")
    async def scheduler_generate(
        req: ScheduleRequest,
        user: dict = Depends(require_auth),
    ):
        config = api.ensure_config(user.get("sub"))
        if not config.schedule_generation_enabled:
            raise HTTPException(status_code=403, detail="Schedule generation is not available. Please contact the administrator for access.")
        try:
            result = await generate_schedule(req)
            output = ScheduleOutput(**result.model_dump())
            schedule_store.put(
                user.get("sub"),
                req.company_profile.domain_url,
                output.model_dump(mode="json"),
            )
            return output
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @api.app.get("/scheduler/{url:path}")
    async def get_cached_schedule(url: str, user: dict = Depends(require_auth)):
        item = schedule_store.get(user.get("sub"), url)
        if not item:
            raise HTTPException(status_code=404, detail="No cached schedule found.")
        return {"schedule": item["data"], "updatedAt": item["updatedAt"]}

    logger.info("Patched /scheduler/generate endpoint")


_patch_scheduler_endpoint()
