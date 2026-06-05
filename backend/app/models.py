import uuid
import enum
from datetime import datetime
from typing import List, Optional, Any, Dict

from sqlalchemy import ForeignKey, Text, DateTime, String, Integer, Boolean, UniqueConstraint, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class AssignmentStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"


class TaskType(str, enum.Enum):
    ANNOTATION = "annotation"
    VALIDATION = "validation"


class DatasetStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Text, unique=True, index=True)
    password: Mapped[str] = mapped_column(Text)
    name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    roles: Mapped[List["Role"]] = relationship(secondary="user_roles", back_populates="users")
    datasets: Mapped[List["Dataset"]] = relationship(back_populates="owner")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="user")
    tags: Mapped[List["Tag"]] = relationship(secondary="user_tags", back_populates="users")
    dataset_accesses: Mapped[List["UserDatasetAccess"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, unique=True)

    users: Mapped[List["User"]] = relationship(secondary="user_roles", back_populates="roles")


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"))


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required_answers: Mapped[int] = mapped_column(Integer, server_default="3")
    default_tasks_limit: Mapped[int] = mapped_column(Integer, server_default="50")
    status: Mapped[DatasetStatus] = mapped_column(SAEnum(DatasetStatus, name="dataset_status", values_callable=lambda x: [e.value for e in x]), default=DatasetStatus.ACTIVE)
    tasks_count: Mapped[int] = mapped_column(Integer, server_default="0")
    requires_validation: Mapped[bool] = mapped_column(Boolean, server_default="false")
    validation_quorum: Mapped[int] = mapped_column(Integer, server_default="1")
    annotation_labels: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column("annotation_labels", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    settings: Mapped[dict] = mapped_column(JSONB, server_default='{}', default=dict)

    owner: Mapped["User"] = relationship(back_populates="datasets")
    tasks: Mapped[List["Task"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    tags: Mapped[List["Tag"]] = relationship(secondary="dataset_tags", back_populates="datasets")
    user_accesses: Mapped[List["UserDatasetAccess"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(Text)
    type: Mapped[TaskType] = mapped_column(SAEnum(TaskType, name="task_type", values_callable=lambda x: [e.value for e in x]), default=TaskType.ANNOTATION)
    completed_answers: Mapped[int] = mapped_column(Integer, server_default="0")
    active_assignments: Mapped[int] = mapped_column(Integer, server_default="0")
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus, name="task_status", values_callable=lambda x: [e.value for e in x]), default=TaskStatus.PENDING)
    # Слово metadata зарезервировано в алхимии (Base.metadata), поэтому атрибут называется task_metadata
    task_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    dataset: Mapped["Dataset"] = relationship(back_populates="tasks")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="task", cascade="all, delete-orphan")


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="unique_user_task"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[AssignmentStatus] = mapped_column(SAEnum(AssignmentStatus, name="assignment_status", values_callable=lambda x: [e.value for e in x]))
    assigned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    task: Mapped["Task"] = relationship(back_populates="assignments")
    user: Mapped["User"] = relationship(back_populates="assignments")
    label: Mapped[Optional["Label"]] = relationship(
        back_populates="assignment",
        uselist=False,
        cascade="all, delete-orphan",
        single_parent=True,
        passive_deletes=True,
    )


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"), unique=True)
    result: Mapped[Dict[str, Any]] = mapped_column(JSONB)
    is_validated: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    assignment: Mapped["Assignment"] = relationship(back_populates="label")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, unique=True)
    color: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    users: Mapped[List["User"]] = relationship(secondary="user_tags", back_populates="tags")
    datasets: Mapped[List["Dataset"]] = relationship(secondary="dataset_tags", back_populates="tags")


class UserTag(Base):
    __tablename__ = "user_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"))


class DatasetTag(Base):
    __tablename__ = "dataset_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"))


class UserDatasetAccess(Base):
    __tablename__ = "user_dataset_access"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), primary_key=True)

    tasks_limit: Mapped[int] = mapped_column(Integer, server_default="50")
    tasks_done: Mapped[int] = mapped_column(Integer, server_default="0")
    can_label: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')

    user: Mapped["User"] = relationship(back_populates="dataset_accesses")
    dataset: Mapped["Dataset"] = relationship(back_populates="user_accesses")
