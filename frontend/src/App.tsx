import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import { AuthPage } from './pages/AuthPage';
import { ROUTES } from './config/routes';
import { MOCK_DATASET_ID } from './services/task/MockTaskService';
import { buildRoute } from './config/routes';
import styles from './App.module.css';

// Временный редирект с '/' на мок-датасет до реализации страницы выбора датасета.
const HOME_REDIRECT = buildRoute(ROUTES.datasetAnnotation, { datasetId: MOCK_DATASET_ID });

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path={ROUTES.login}              element={<AuthPage />} />
          <Route path={ROUTES.home}               element={<Navigate to={HOME_REDIRECT} replace />} />
          <Route path={ROUTES.datasetAnnotation}  element={<WorkspacePage />} />
          <Route path={ROUTES.datasetValidation}  element={<ValidationPage />} />
          <Route path="*"                         element={<Navigate to={ROUTES.login} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
