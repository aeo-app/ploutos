from scheduler.platforms.base import PlatformAdapter


class InstagramAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "instagram"

    @property
    def name(self) -> str:
        return "Instagram"

    @property
    def post_types(self) -> list[str]:
        return ["image_post", "video", "carousel", "reel", "story"]

    @property
    def max_caption_length(self) -> int:
        return 2200

    @property
    def max_hashtags(self) -> int:
        return 30

    @property
    def supports_paid_ads(self) -> bool:
        return True

    def extra_fields(self) -> list[str]:
        return ["is_reel", "story_variant"]
