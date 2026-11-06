import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import rootReducer from '../reducers';
import { RootState, AppStore } from '../redux/types';

const enhancer = applyMiddleware(thunk);

export default function configureStore(initialState?: RootState): AppStore {
  return createStore(rootReducer, initialState, enhancer) as AppStore;
}
