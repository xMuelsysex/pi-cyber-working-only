export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const typescriptSpecifier = `${specifier.slice(0, -3)}.ts`;
    try {
      return await nextResolve(typescriptSpecifier, context);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.code !== "ERR_MODULE_NOT_FOUND"
      ) {
        throw error;
      }
    }
  }
  return nextResolve(specifier, context);
}
