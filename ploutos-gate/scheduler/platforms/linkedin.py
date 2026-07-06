from scheduler.platforms.base import PlatformAdapter


class LinkedInAdapter(PlatformAdapter):
    @property
    def platform_id(self) -> str:
        return "linkedin"

    @property
    def name(self) -> str:
        return "LinkedIn"

    @property
    def post_types(self) -> list[str]:
        return ["image_post", "video", "carousel", "article", "poll", "testimonial"]

    @property
    def max_caption_length(self) -> int:
        return 3000

    @property
    def max_hashtags(self) -> int:
        return 5

    @property
    def supports_paid_ads(self) -> bool:
        return True

    def extra_fields(self) -> list[str]:
        return ["is_article", "professional_tone_score"]
