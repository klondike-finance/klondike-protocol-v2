import { AppBar, createMuiTheme, CssBaseline, ThemeProvider, withTheme } from '@material-ui/core';
import React, { useCallback } from 'react';
import { ethers } from 'ethers';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import Toolbar from './components/Toolbar';
import UniswapPage from './pages/UniswapPage';
import PoolsPage from './pages/PoolsPage';
import FundsPage from './pages/FundsPage';
import ManagersPage from './pages/Managers';
import styled from 'styled-components';
import { getDeployments } from './lib/utils';
import './App.css';

const theme = createMuiTheme({
  palette: {
    type: 'dark',
  },
  overrides: {
    MuiAppBar: {
      colorDefault: {
        color: '#eee',
        background: '#424b86',
      },
    },
  },
});

export const EthereumContext: React.Context<{
  deployments?: { [key: string]: any };
  provider?: ethers.providers.Web3Provider;
}> = React.createContext({});

function App() {
  const deployments = useCallback(getDeployments, []);
  const provider = useCallback(() => new ethers.providers.Web3Provider((window as any).ethereum), []);
  return (
    <EthereumContext.Provider value={{ deployments: deployments(), provider: provider() }}>
      <Router>
        <CssBaseline />
        <ThemeProvider theme={theme}>
          <ThemedInner />
        </ThemeProvider>
      </Router>
    </EthereumContext.Provider>
  );
}

const Inner = (props: any) => {
  return (
    <StyledInner {...props}>
      <AppBar position="static" color="default">
        <Toolbar />
      </AppBar>
      <div className="app-container">
        <Switch>
          <Route path="/uniswap" component={UniswapPage} />
          <Route path="/pools" component={PoolsPage} />
          <Route path="/funds" component={FundsPage} />
          <Route path="/managers" component={ManagersPage} />
          <Route component={UniswapPage} />
        </Switch>
      </div>
    </StyledInner>
  );
};

const ThemedInner = withTheme(Inner);

const StyledInner = styled.div`
  background: ${(props: any) => props.theme.palette.background.default};
  min-height: 100vh;
`;

export default App;
