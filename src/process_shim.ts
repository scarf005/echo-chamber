const processValue = Reflect.get(globalThis, "process")

if (processValue && typeof processValue === "object") {
  const processWithPlainEnv = Object.create(processValue) as {
    env: Record<string, string | undefined>
  }
  processWithPlainEnv.env = {}
  Reflect.set(globalThis, "process", processWithPlainEnv)
}
