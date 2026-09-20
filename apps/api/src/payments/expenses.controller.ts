import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { createExpenseSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ExpensesService } from './expenses.service.js';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  list() {
    return this.expensesService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createExpenseSchema))
    body: ReturnType<typeof createExpenseSchema.parse>,
  ) {
    return this.expensesService.create(body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.expensesService.delete(id);
  }
}
