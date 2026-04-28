import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspacePage }    from './pages/WorkspacePage';
import { ValidationPage }   from './pages/ValidationPage';
import { AuthPage }         from './pages/AuthPage';
import { DatasetsListPage } from './pages/DatasetsListPage';
import { ProfilePage }      from './pages/ProfilePage';
import { MyDatasetsPage }   from './pages/MyDatasetsPage';
import { DatasetEditPage }  from './pages/DatasetEditPage';
import { UsersPage }        from './pages/UsersPage';
import { TagsPage }         from './pages/TagsPage';
import { ROUTES }           from './config/routes';
import styles from './App.module.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path={ROUTES.login}             element={<AuthPage />} />
          <Route path={ROUTES.home}              element={<DatasetsListPage />} />
          <Route path={ROUTES.profile}           element={<ProfilePage />} />
          <Route path={ROUTES.myDatasets}        element={<MyDatasetsPage />} />
          <Route path={ROUTES.datasetNew}        element={<DatasetEditPage />} />
          <Route path={ROUTES.datasetAnnotation} element={<WorkspacePage />} />
          <Route path={ROUTES.datasetValidation} element={<ValidationPage />} />
          <Route path={ROUTES.users}             element={<UsersPage />} />
          <Route path={ROUTES.tags}              element={<TagsPage />} />
          <Route path="*"                        element={<Navigate to={ROUTES.login} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
