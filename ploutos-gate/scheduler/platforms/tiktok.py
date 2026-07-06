from scheduler.platforms.base import PlatformAdapter


class TikTokAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "tiktok"

    @property
    def name(self) -> str:
        return "TikTok"

    @property
    def post_types(self) -> list[str]:
        return ["video", "duet"]

    @property
    def max_caption_length(self) -> int:
        return 2200

    @property
    def max_hashtags(self) -> int:
        return 10

    @property
    def supports_paid_ads(self) -> bool:
        return False

    def extra_fields(self) -> list[str]:
        return ["video_duration_seconds", "trending_sounds_note"]
