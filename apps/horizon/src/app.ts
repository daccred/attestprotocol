import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import cors from 'cors'

import * as middlewares from './middlewares'
import MessageResponse from './interfaces/MessageResponse'
import systemRouter from './router/system.router'
import ingestRouter from './router/ingest.router'
import dataRouter from './router/data.router'
import analyticsRouter from './router/analytics.router'
import registryRouter from './router/registry.router'
import contractsRouter from './router/contracts.router'
import { logRouter } from './common/logger'

require('dotenv').config()

const app = express()

app.use(morgan('dev'))
app.use(helmet())
app.use(cors())
app.use(express.json())

app.get<{}, MessageResponse>('/', (req, res) => {
  res.json({
    message: '🦄🌈✨👋🌎🌍🌏✨🌈🦄',
  })
})

app.use('/api', systemRouter)
app.use('/api/ingest', ingestRouter)
app.use('/api/data', dataRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/registry', registryRouter)
app.use('/api/contracts', contractsRouter)

app.use(middlewares.notFound)
app.use(middlewares.errorHandler)

logRouter('/api', systemRouter)
logRouter('/api/ingest', ingestRouter)
logRouter('/api/data', dataRouter)
logRouter('/api/analytics', analyticsRouter)
logRouter('/api/registry', registryRouter)
logRouter('/api/contracts', contractsRouter)

export default app
