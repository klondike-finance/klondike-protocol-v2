import { IconButton, Tab, Tabs, Toolbar as ToolbarUI } from '@material-ui/core';
import { withRouter } from 'react-router-dom';
import { History, Location } from 'history';

const routes: { [key: string]: number } = {
  '/': 0,
  '/uniswap': 0,
  '/reward_pools': 1,
  '/swap_pools': 2,
  '/managers': 3,
  '/boardrooms': 4,
  '/funds': 5,
  '/tokens': 6,
};

const reverseRoutes = ['/uniswap', '/reward_pools', '/swap_pools', '/managers', '/boardrooms', '/funds', '/tokens'];

const Toolbar = ({ history, location }: { history: History; location: Location }) => {
  function handleChange(_: any, value: number) {
    history.push(reverseRoutes[value]);
  }
  return (
    <ToolbarUI>
      <IconButton edge="start" color="inherit" aria-label="menu"></IconButton>
      <Tabs value={routes[location.pathname]} onChange={handleChange} indicatorColor="primary">
        <Tab label="Uniswap Pools" />
        <Tab label="Reward Pools" />
        <Tab label="Swap Pools" />
        <Tab label="Managers" />
        <Tab label="Boardrooms" />
        <Tab label="Funds" />
        <Tab label="Tokens" />
      </Tabs>
    </ToolbarUI>
  );
};

export default withRouter(Toolbar);
