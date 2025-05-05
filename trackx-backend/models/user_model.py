from pydantic import BaseModel, EmailStr

class UserRegisterRequest(BaseModel):
    first_name: str
    surname: str
    email: EmailStr
    id_number: str
    investigator_id: str
    dob: str
    password: str

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str
