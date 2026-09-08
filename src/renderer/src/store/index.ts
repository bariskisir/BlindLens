/**
 * Configures the renderer Redux store and typed React hooks.
 */

import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import appReducer from './appSlice'

const store = configureStore({
  reducer: { app: appReducer },
})

/** Complete state shape exposed by the renderer store. */
export type RootState = ReturnType<typeof store.getState>
/** Dispatch function specialized for the renderer store. */
export type AppDispatch = typeof store.dispatch

/** Returns the strongly typed renderer dispatch function. */
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>()

/** Selects renderer state with the store's complete inferred shape. */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

export default store
