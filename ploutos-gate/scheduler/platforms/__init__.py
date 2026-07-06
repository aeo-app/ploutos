from scheduler.platforms.base import PlatformAdapter
from scheduler.platforms.facebook import FacebookAdapter
from scheduler.platforms.instagram import InstagramAdapter
from scheduler.platforms.linkedin import LinkedInAdapter
from scheduler.platforms.twitter_x import TwitterXAdapter
from scheduler.platforms.tiktok import TikTokAdapter
from scheduler.platforms.youtube import YouTubeAdapter
from scheduler.platforms.pinterest import PinterestAdapter

_REGISTRY: dict[str, type[PlatformAdapter]] = {
    "facebook": FacebookAdapter,
    "instagram": InstagramAdapter,
    "linkedin": LinkedInAdapter,
    "twitter_x": TwitterXAdapter,
    "tiktok": TikTokAdapter,
    "youtube": YouTubeAdapter,
    "pinterest": PinterestAdapter,
}


def get_adapter(platform_id: str) -> PlatformAdapter:
    cls = _REGISTRY.get(platform_id)
    if not cls:
        raise ValueError(f"Unknown platform: {platform_id}")
    return cls()


def list_platforms() -> list[dict]:
    result = []
    for pid, cls in _REGISTRY.items():
        inst = cls()
        result.append({
            "id": inst.platform_id,
            "name": inst.name,
            "post_types": inst.post_types,
            "max_caption_length": inst.max_caption_length,
            "max_hashtags": inst.max_hashtags,
            "supports_paid_ads": inst.supports_paid_ads,
            "extra_fields": inst.extra_fields(),
        })
    return result


def list_platform_ids() -> list[str]:
    return list(_REGISTRY.keys())
