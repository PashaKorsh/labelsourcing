import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import { AuthPage } from './pages/AuthPage';
import { ROUTES } from './config/routes';
import styles from './App.module.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path={ROUTES.login}           element={<AuthPage />} />
          <Route path="/workspace/:datasetId"  element={<WorkspacePage />} />
          <Route path="/validation/:datasetId" element={<ValidationPage />} />
          <Route path="*"                      element={<Navigate to={ROUTES.login} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
