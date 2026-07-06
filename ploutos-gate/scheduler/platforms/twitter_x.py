from scheduler.platforms.base import PlatformAdapter


class TwitterXAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "twitter_x"

    @property
    def name(self) -> str:
        return "X (Twitter)"

    @property
    def post_types(self) -> list[str]:
        return ["image_post", "video", "thread", "poll"]

    @property
    def max_caption_length(self) -> int:
        return 280

    @property
    def max_hashtags(self) -> int:
        return 2

    @property
    def supports_paid_ads(self) -> bool:
        return True

    def extra_fields(self) -> list[str]:
        return ["thread_count", "character_count"]
