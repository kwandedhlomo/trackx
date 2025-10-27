from pydantic import BaseModel, Field
from typing import List


class CaseCommentCreateRequest(BaseModel):
    author_id: str = Field(..., alias="authorId")
    text: str
    mentions: List[str] = Field(default_factory=list)
    notify_all: bool = Field(default=False, alias="notifyAll")

    class Config:
        allow_population_by_field_name = True
