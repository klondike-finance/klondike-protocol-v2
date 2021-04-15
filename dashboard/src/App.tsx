import { AppBar, createMuiTheme, CssBaseline, ThemeProvider, withTheme } from '@material-ui/core';
import React, { useCallback } from 'react';
import { ethers } from 'ethers';
import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import Toolbar from './components/Toolbar';
import UniswapPage from './pages/UniswapPage';
import BoardroomsPage from './pages/BoardroomsPage';
import RewardPoolsPage from './pages/RewardPoolsPage';
import FundsPage from './pages/FundsPage';
import ManagersPage from './pages/Managers';
import TokensPage from './pages/TokensPage';
import styled from 'styled-components';
import { buildIndex, getDeployments, getRegistry } from './lib/utils';
import './App.css';
import SwapPoolsPage from './pages/SwapPoolsPage';

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
  registry?: { [key: string]: any };
  provider?: ethers.providers.Web3Provider;
  addressIndex?: { [key: string]: any };
}> = React.createContext({});

function App() {
  const deployments = useCallback(getDeployments, []);
  const registry = useCallback(getRegistry, []);
  const provider = useCallback(() => new ethers.providers.Web3Provider((window as any).ethereum), []);
  const addressIndex = useCallback(() => {
    return buildIndex(registry());
  }, [registry()]);
  return (
    <EthereumContext.Provider
      value={{ deployments: deployments(), provider: provider(), addressIndex: addressIndex(), registry: registry() }}
    >
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
          <Route path="/reward_pools" component={RewardPoolsPage} />
          {/* <Route path="/swap_pools" component={SwapPoolsPage} /> */}
          <Route path="/funds" component={FundsPage} />
          <Route path="/managers" component={ManagersPage} />
          <Route path="/boardrooms" component={BoardroomsPage} />
          <Route path="/tokens" component={TokensPage} />
          <Redirect to="/uniswap" />
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
