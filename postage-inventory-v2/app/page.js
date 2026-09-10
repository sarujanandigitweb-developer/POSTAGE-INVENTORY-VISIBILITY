import Shell from '@/components/Shell';

// A server component that renders the client shell. No database access happens
// here — the shell calls /api/inventory, which is the only thing that connects.
export default function Page() {
  return <Shell />;
}
