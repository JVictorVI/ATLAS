import * as path from "path";

export function getContainedRelativePath(
  parentPath: string,
  candidatePath: string,
): string | null {
  const relativePath = path.relative(
    path.resolve(parentPath),
    path.resolve(candidatePath),
  );

  if (relativePath === "") {
    return "";
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return relativePath;
}
