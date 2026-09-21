import React from 'react'
import { DashboardLayout } from '../../components/dashboard/DashboardLayout'
import AdminDashboard from '../../components/admin/AdminDashboard'

export default function AdminPage() {
  return (
    <DashboardLayout>
      <AdminDashboard />
    </DashboardLayout>
  )
}
