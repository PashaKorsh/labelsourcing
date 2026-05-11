import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }        from './context/auth';
import { ProtectedRoute }      from './components/ProtectedRoute';
import { WorkspacePage }       from './pages/WorkspacePage';
import { AuthPage }            from './pages/AuthPage';
import { DatasetsListPage }    from './pages/DatasetsListPage';
import { ProfilePage }         from './pages/ProfilePage';
import { MyDatasetsPage }      from './pages/MyDatasetsPage';
import { DatasetNewPage }      from './pages/DatasetNewPage';
import { DatasetEditPage }     from './pages/DatasetEditPage';
import { UsersPage }           from './pages/UsersPage';
import { TagsPage }            from './pages/TagsPage';
import { ROUTES }              from './config/routes';
import styles from './App.module.css';

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className={styles.root}>
          <Routes>
            <Route path={ROUTES.login}             element={<AuthPage />} />
            <Route path={ROUTES.home}              element={<P><DatasetsListPage /></P>} />
            <Route path={ROUTES.profile}           element={<P><ProfilePage /></P>} />
            <Route path={ROUTES.myDatasets}        element={<P><MyDatasetsPage /></P>} />
            <Route path={ROUTES.datasetNew}        element={<P><DatasetNewPage /></P>} />
            <Route path={ROUTES.datasetEdit}       element={<P><DatasetEditPage /></P>} />
            <Route path={ROUTES.datasetAnnotation} element={<P><WorkspacePage /></P>} />
            <Route path={ROUTES.users}             element={<P><UsersPage /></P>} />
            <Route path={ROUTES.tags}              element={<P><TagsPage /></P>} />
            <Route path="*"                        element={<Navigate to={ROUTES.login} replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
