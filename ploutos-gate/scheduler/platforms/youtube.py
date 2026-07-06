from scheduler.platforms.base import PlatformAdapter


class YouTubeAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "youtube"

    @property
    def name(self) -> str:
        return "YouTube"

    @property
    def post_types(self) -> list[str]:
        return ["video", "short"]

    @property
    def max_caption_length(self) -> int:
        return 5000

    @property
    def max_hashtags(self) -> int:
        return 15

    @property
    def supports_paid_ads(self) -> bool:
        return True

    def extra_fields(self) -> list[str]:
        return ["video_duration_seconds", "seo_title", "description", "tags"]
