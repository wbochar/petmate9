import configureStoreDev from './configureStore.dev'
import configureStoreProd from './configureStore.prod'
import { RootState, AppStore } from '../redux/types';

const configureStore: (initialState?: RootState) => AppStore =
  process.env.NODE_ENV === 'production' ? configureStoreProd : configureStoreDev;

export default configureStore;
