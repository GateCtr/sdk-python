from __future__ import annotations


class GateCtrError(Exception):
    """Base exception for all GateCtr SDK errors."""


class GateCtrConfigError(GateCtrError):
    """Raised synchronously at construction for invalid configuration."""


class GateCtrApiError(GateCtrError):
    """Raised when the Platform returns a non-2xx HTTP response."""

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: str,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id

    def to_dict(self) -> dict[str, object]:
        """Returns a plain dict safe for logging. Never includes api_key."""
        return {
            "name": type(self).__name__,
            "message": str(self),
            "status": self.status,
            "code": self.code,
            "request_id": self.request_id,
        }


class GateCtrTimeoutError(GateCtrError):
    """Raised when a request exceeds the configured timeout."""

    def __init__(self, timeout_s: float) -> None:
        super().__init__(f"Request timed out after {timeout_s}s")
        self.timeout_s = timeout_s


class GateCtrStreamError(GateCtrError):
    """Raised when a streaming connection fails mid-stream."""

    def __init__(self, message: str, cause: BaseException | None = None) -> None:
        super().__init__(message)
        self.__cause__ = cause


class GateCtrNetworkError(GateCtrError):
    """Raised for DNS failures, connection refused, and transport-level errors."""

    def __init__(self, message: str, cause: BaseException | None = None) -> None:
        super().__init__(message)
        self.__cause__ = cause
