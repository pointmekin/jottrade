import { ModeToggle } from '@/components/mode-toggle'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/settings')({
  component: RouteComponent,
  ssr: false,
})

function RouteComponent() {
  return <div className="flex flex-col">
    <h2 className="text-lg font-bold">Settings</h2>
    <p className="text-sm text-muted-foreground">Customize your experience</p>

    <div className="flex items-center gap-2">
    <ModeToggle />
    </div>
  </div>
}
