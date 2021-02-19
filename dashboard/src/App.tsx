import {
  AppBar,
  Button,
  createMuiTheme,
  CssBaseline,
  IconButton,
  Tab,
  Tabs,
  ThemeProvider,
  Typography,
  withTheme,
} from '@material-ui/core';
import React from 'react';
import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom';
import Toolbar from './components/Toolbar';
import UniswapPage from './pages/UniswapPage';
import './App.css';
import PoolsPage from './pages/PoolsPage';
import FundsPage from './pages/FundsPage';
import ManagersPage from './pages/Managers';
import styled from 'styled-components';
import { green, purple } from '@material-ui/core/colors';

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

function App() {
  return (
    <Router>
      <CssBaseline />
      <ThemeProvider theme={theme}>
        <ThemedInner />
      </ThemeProvider>
    </Router>
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
