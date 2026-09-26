export default function () {
  const now = new Date();
  return { year: now.getFullYear(), date: now.toISOString() };
}
