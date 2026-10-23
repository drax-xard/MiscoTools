"""Plugin errors with client-safe messages."""

from __future__ import annotations


class PluginError(Exception):
    """Base class for plugin failures."""


class PluginManifestError(PluginError, ValueError):
    """The manifest is malformed or unsafe."""


class PluginValidationError(PluginError, ValueError):
    """A tool call does not match its declared JSON schema."""


class PluginNotFound(PluginError):
    """The plugin does not exist."""


class PluginNotLoaded(PluginError):
    """The plugin manifest exists but its code could not be loaded."""


class PluginDisabled(PluginError):
    """The plugin is not enabled."""


class PluginPermissionError(PluginError):
    """The plugin or tool lacks a required capability."""


class PluginConfirmationRequired(PluginError):
    """The tool requires an explicit confirmation."""


class PluginTimeout(PluginError):
    """The plugin exceeded its execution time budget."""


class PluginExecutionError(PluginError):
    """The plugin failed while executing."""
