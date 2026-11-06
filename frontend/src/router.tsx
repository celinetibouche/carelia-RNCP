import { Route, Routes } from 'react-router'
import { AuthGate } from './AuthContext.tsx'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { ChildDetailPage } from './pages/ChildDetailPage.tsx'
import { ChildFormPage } from './pages/ChildFormPage.tsx'
import { ChildrenPage } from './pages/ChildrenPage.tsx'
import { DailyReportPage } from './pages/DailyReportPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { MorePage } from './pages/MorePage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { NotificationsPage } from './pages/NotificationsPage.tsx'
import { ReportsPage } from './pages/ReportsPage.tsx'
import { UsersPage } from './pages/UsersPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { ConversationPage } from './pages/ConversationPage.tsx'

// Toutes les routes de l'appli au même endroit. Elles sont imbriquées dans AppLayout :
// le layout (barre d'onglets) reste affiché, seule la page au centre change.
export function AppRoutes() {
  return (
    <AuthGate><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="enfants" element={<ChildrenPage />} />
        <Route path="enfants/nouveau" element={<ChildFormPage />} />
        <Route path="enfants/:childId" element={<ChildDetailPage />} />
        <Route path="bulletins" element={<ReportsPage />} />
        <Route path="plus" element={<MorePage />} />
        <Route path="bulletin" element={<DailyReportPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="utilisateurs" element={<UsersPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:conversationId" element={<ConversationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></AuthGate>
  )
}
