const sourcePath = new URL("../.githooks/pre-commit", import.meta.url)
const commandResult = await new Deno.Command("git", {
  args: ["rev-parse", "--git-path", "hooks"],
}).output()

if (commandResult.code !== 0) {
  throw new Error(new TextDecoder().decode(commandResult.stderr).trim())
}

const hooksDirectory = new TextDecoder().decode(commandResult.stdout).trim()
const targetPath = `${hooksDirectory}/pre-commit`

await Deno.mkdir(hooksDirectory, {
  recursive: true,
})
await Deno.copyFile(sourcePath, targetPath)

if (Deno.build.os !== "windows") {
  await Deno.chmod(targetPath, 0o755)
}
