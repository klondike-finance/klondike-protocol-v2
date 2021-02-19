import { IconButton, Tab, Tabs, Toolbar as ToolbarUI } from '@material-ui/core';
import { withRouter } from 'react-router-dom';
import { History, Location } from 'history';

const routes: { [key: string]: number } = {
  '/': 0,
  '/uniswap': 0,
  '/pools': 1,
  '/managers': 2,
  '/funds': 3,
};

const Toolbar = ({ history, location }: { history: History; location: Location }) => {
  function handleChange(_: any, value: number) {
    switch (value) {
      case 0:
        history.push('/uniswap');
        break;
      case 1:
        history.push('/pools');
        break;
      case 2:
        history.push('/managers');
        break;
      case 3:
        history.push('/funds');
        break;

      default:
        break;
    }
  }
  return (
    <ToolbarUI>
      <IconButton edge="start" color="inherit" aria-label="menu"></IconButton>
      <Tabs value={routes[location.pathname]} onChange={handleChange} indicatorColor="primary">
        <Tab label="Uniswap Pools" />
        <Tab label="Pools" />
        <Tab label="Managers" />
        <Tab label="Funds" />
      </Tabs>
    </ToolbarUI>
  );
};

export default withRouter(Toolbar);
