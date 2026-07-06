from scheduler.platforms.base import PlatformAdapter


class FacebookAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "facebook"

    @property
    def name(self) -> str:
        return "Facebook"

    @property
    def post_types(self) -> list[str]:
        return ["image_post", "video", "carousel", "link_post", "poll", "testimonial", "story", "paid_ad", "boosted_post", "event"]

    @property
    def max_caption_length(self) -> int:
        return 63206

    @property
    def max_hashtags(self) -> int:
        return 30

    @property
    def supports_paid_ads(self) -> bool:
        return True
