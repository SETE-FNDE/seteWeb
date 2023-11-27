import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/AuthContex';
import { AlertModalStyles } from './hooks/AlertModal';
import Routes from './routes';
import GlobalStyles from './styles/global';

const App: React.FC = () => {
    return (
        <>
            <BrowserRouter basename="/seteadmin">
                <GlobalStyles />
                <AlertModalStyles />
                <AuthProvider>
                    <Routes />
                </AuthProvider>
            </BrowserRouter>
        </>
    );
};

export default App;