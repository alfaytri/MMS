import { AdminSidebar } from '@/components/master-data/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 pl-6 sm:p-6 sm:pl-8 lg:p-8 lg:pl-12 pb-20">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <AdminSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
