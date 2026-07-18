import { AdminSidebar } from '@/components/master-data/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 pb-20">
      <div className="flex flex-col gap-3 lg:gap-4 lg:flex-row lg:items-start">
        <AdminSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
