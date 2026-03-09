const sourcePath = new URL("../.githooks/pre-commit", import.meta.url)
const targetPath = new URL("../.git/hooks/pre-commit", import.meta.url)

await Deno.mkdir(new URL("../.git/hooks/", import.meta.url), {
  recursive: true,
})
await Deno.copyFile(sourcePath, targetPath)

if (Deno.build.os !== "windows") {
  await Deno.chmod(targetPath, 0o755)
}
