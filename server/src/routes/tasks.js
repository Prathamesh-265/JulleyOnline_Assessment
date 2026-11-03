import { Router } from 'express';
import { z } from 'zod';
import * as tasks from '../services/tasks.js';
import { uuidParam } from '../utils/uuidParam.js';

const router = Router();
router.param('id', uuidParam);

const id = z.string().uuid();
const version = z.number().int().positive();
const field = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  assignedTo: id.nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  dueDate: z.coerce.date().nullable(),
};

const createSchema = z.object({
  boardId: id,
  columnId: id,
  title: field.title,
  description: field.description.optional(),
  assignedTo: field.assignedTo.optional(),
  priority: field.priority.optional(),
  dueDate: field.dueDate.optional(),
});

// partial update: send only what changed, plus the version you last saw
const updateSchema = z
  .object({
    version,
    title: field.title.optional(),
    description: field.description.optional(),
    assignedTo: field.assignedTo.optional(),
    priority: field.priority.optional(),
    dueDate: field.dueDate.optional(),
  })
  .refine((d) => Object.keys(d).length > 1, 'Nothing to update');

// afterId = the task this one should sit directly below; null/absent = top of the column
const moveSchema = z.object({ version, columnId: id, afterId: id.nullable().optional() });

router.get('/', async (req, res) => {
  const { boardId } = z.object({ boardId: id }).parse(req.query);
  res.json(await tasks.listTasks(req.user, boardId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await tasks.createTask(req.user, createSchema.parse(req.body)));
});

router.get('/:id', async (req, res) => res.json(await tasks.getTask(req.user, req.params.id)));

router.put('/:id', async (req, res) => {
  res.json(await tasks.updateTask(req.user, req.params.id, updateSchema.parse(req.body)));
});

router.patch('/:id/move', async (req, res) => {
  res.json(await tasks.moveTask(req.user, req.params.id, moveSchema.parse(req.body)));
});

router.delete('/:id', async (req, res) => {
  await tasks.deleteTask(req.user, req.params.id);
  res.status(204).end();
});

export default router;
