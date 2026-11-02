"""Desktop-owned memberships and persistent group links. Never edits agent data."""

from dataclasses import asdict, dataclass, replace
import json
from uuid import uuid4

from session_manager.agent import atomic_write
from session_manager.groups import Group as BaseGroup, GroupStore as BaseGroupStore
from session_manager.models import ManagerError


def source_identity(source):
    if source["kind"] == "user":
        return ("user", source["id"])
    return ("automatic", tuple(sorted((item["key"], item.get("root", "")) for item in source["selectors"])))


def validate_source(source):
    if not isinstance(source, dict) or not isinstance(source.get("name"), str) or not source["name"].strip():
        raise ValueError("Invalid group link name.")
    if source.get("kind") == "user":
        if not isinstance(source.get("id"), str) or not source["id"]:
            raise ValueError("Invalid linked group ID.")
    elif source.get("kind") == "automatic":
        selectors = source.get("selectors")
        if not isinstance(selectors, list) or not selectors:
            raise ValueError("Invalid automatic group selectors.")
        for selector in selectors:
            if not isinstance(selector, dict) or set(selector) - {"key", "root"} or "key" not in selector:
                raise ValueError("Invalid automatic group selector.")
            for field, value in selector.items():
                if not isinstance(value, str):
                    raise ValueError("Invalid group identity.")
                parts = json.loads(value)
                lengths = {"desktop-source": 7, "root": 4, "computer": 3, "no-root": 2}
                if (not isinstance(parts, list) or not parts or not all(isinstance(p, str) and p for p in parts)
                        or len(parts) != lengths.get(parts[0]) or (field == "root" and parts[0] != "root")):
                    raise ValueError("Invalid group identity.")
        if len(set(source_identity(source)[1])) != len(selectors):
            raise ValueError("Duplicate group selectors.")
    else:
        raise ValueError("Unsupported group link kind.")


@dataclass(frozen=True)
class Group(BaseGroup):
    links: tuple[dict, ...] = ()


class GroupStore(BaseGroupStore):
    def load(self):
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except (OSError, ValueError) as error:
            raise ManagerError("GROUP_READ_FAILED", str(error)) from None
        try:
            if data["version"] not in (1, 2) or not isinstance(data["groups"], list):
                raise ValueError("Unsupported group file format.")
            groups = []
            for item in data["groups"]:
                if not isinstance(item["id"], str) or not item["id"]:
                    raise ValueError("Invalid group ID.")
                if not isinstance(item["name"], str) or not item["name"].strip():
                    raise ValueError("Invalid group name.")
                members = item["members"]
                if not isinstance(members, list) or any(
                        not isinstance(m, list) or len(m) != 3 or not all(isinstance(p, str) and p for p in m)
                        for m in members):
                    raise ValueError("Invalid session membership.")
                links = item.get("links", []) if data["version"] == 1 else item["links"]
                if not isinstance(links, list):
                    raise ValueError("Invalid group links.")
                for source in links:
                    validate_source(source)
                if len({source_identity(source) for source in links}) != len(links):
                    raise ValueError("Duplicate group links.")
                groups.append(Group(item["id"], item["name"], tuple(dict.fromkeys(map(tuple, members))), tuple(links)))
            if len({g.id for g in groups}) != len(groups) or len({g.name.casefold() for g in groups}) != len(groups):
                raise ValueError("Duplicate group IDs or names.")
            self._validate_graph(groups)
            return groups
        except (KeyError, TypeError, ValueError) as error:
            raise ManagerError("GROUP_READ_FAILED", str(error)) from None

    @staticmethod
    def _validate_graph(groups):
        by_id = {group.id: group for group in groups}
        visited, visiting = set(), set()

        def visit(identifier):
            if identifier not in by_id:
                raise ValueError("연결할 사용자 그룹이 없습니다. 목록을 새로고침하세요.")
            if identifier in visiting:
                raise ValueError("자기 자신 또는 순환하는 그룹은 연결할 수 없습니다.")
            if identifier in visited:
                return
            visiting.add(identifier)
            for source in by_id[identifier].links:
                if source["kind"] == "user":
                    visit(source["id"])
            visiting.remove(identifier)
            visited.add(identifier)

        for identifier in by_id:
            visit(identifier)

    def _save(self, groups):
        try:
            self._validate_graph(groups)
            atomic_write(self.path, {"version": 2, "groups": [asdict(group) for group in groups]})
        except ValueError as error:
            raise ManagerError("INVALID_GROUP_LINK", str(error)) from None
        except OSError as error:
            raise ManagerError("GROUP_SAVE_FAILED", str(error)) from None
        return groups

    def create(self, name):
        groups = self.load()
        group = Group(str(uuid4()), self._name(name, groups))
        self._save([*groups, group])
        return group

    def delete(self, identifier):
        groups = self.load()
        self._find(groups, identifier)
        return self._save([replace(group, links=tuple(source for source in group.links
                          if not (source["kind"] == "user" and source["id"] == identifier)))
                          for group in groups if group.id != identifier])

    def _targets(self, groups, identifiers):
        if not isinstance(identifiers, list) or any(not isinstance(i, str) for i in identifiers) or len(set(identifiers)) != len(identifiers):
            raise ManagerError("INVALID_GROUP_TARGETS", "그룹 선택이 올바르지 않습니다.")
        for identifier in identifiers:
            self._find(groups, identifier)
        return set(identifiers)

    def assign_member(self, member, identifiers):
        groups = self.load()
        targets = self._targets(groups, identifiers)
        member = tuple(member)
        return self._save([replace(group, members=tuple(m for m in group.members if m != member)
                                  + ((member,) if group.id in targets else ())) for group in groups])

    def assign_link(self, source, identifiers):
        groups = self.load()
        targets = self._targets(groups, identifiers)
        try:
            validate_source(source)
        except (TypeError, ValueError) as error:
            raise ManagerError("INVALID_GROUP_LINK", str(error)) from None
        if source["kind"] == "user":
            self._find(groups, source["id"])
        identity = source_identity(source)
        return self._save([replace(group, links=tuple(link for link in group.links if source_identity(link) != identity)
                                  + ((source,) if group.id in targets else ())) for group in groups])
