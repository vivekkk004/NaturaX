/** Drops empty filter values so URLs stay clean: { status: '', page: 1 } -> { page: 1 } */
export function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== '' && v !== null && v !== undefined && v !== false,
    ),
  );
}
