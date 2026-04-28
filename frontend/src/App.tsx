import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import { AuthPage } from './pages/AuthPage';
import { DatasetsListPage } from './pages/DatasetsListPage';
import { ROUTES } from './config/routes';
import styles from './App.module.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path={ROUTES.login}             element={<AuthPage />} />
          <Route path={ROUTES.home}              element={<DatasetsListPage />} />
          <Route path={ROUTES.datasetAnnotation} element={<WorkspacePage />} />
          <Route path={ROUTES.datasetValidation} element={<ValidationPage />} />
          <Route path="*"                        element={<Navigate to={ROUTES.login} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
