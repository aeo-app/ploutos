from scheduler.platforms.base import PlatformAdapter


class PinterestAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "pinterest"

    @property
    def name(self) -> str:
        return "Pinterest"

    @property
    def post_types(self) -> list[str]:
        return ["image", "idea_pin", "video"]

    @property
    def max_caption_length(self) -> int:
        return 500

    @property
    def max_hashtags(self) -> int:
        return 10

    @property
    def supports_paid_ads(self) -> bool:
        return True
