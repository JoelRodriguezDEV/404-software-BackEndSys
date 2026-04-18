/*eslint-disable*/
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Response } from 'express';

@UseGuards(AuthGuard)
@Controller('api/events')
export class EventsController {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
  ) {}

  // --- EVENTOS ---
  @Get()
  async getEvents() {
    return this.prisma.event.findMany({
      include: { expenses: true },
      orderBy: { date: 'desc' },
    });
  }

  @Post()
  async createEvent(@Body() data: { name: string }) {
    return this.prisma.event.create({ data: { name: data.name } });
  }

  // --- REPORTE PDF DEL EVENTO ---
  @Get(':id/print')
  async printEvent(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reports.generateEventReport(parseInt(id));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Presupuesto_Evento_${id}.pdf`,
    });
    res.end(buffer);
  }

  // --- CATEGORÍAS ---
  @Get('categories')
  async getCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('categories')
  async createCategory(@Body() data: { name: string }) {
    return this.prisma.category.create({ data: { name: data.name } });
  }

  // --- GASTOS (PRODUCTOS) ---
  @Get(':eventId/expenses')
  async getExpenses(@Param('eventId') eventId: string) {
    return this.prisma.expense.findMany({
      where: { eventId: parseInt(eventId) },
      include: { category: true },
    });
  }

  @Post('expenses')
  async createExpense(
    @Body()
    data: {
      name: string;
      quantity: number;
      unitCost: number;
      eventId: number;
      categoryId: number;
    },
  ) {
    return this.prisma.expense.create({
      data: {
        name: data.name,
        quantity: parseInt(data.quantity.toString()),
        unitCost: parseFloat(data.unitCost.toString()),
        eventId: parseInt(data.eventId.toString()),
        categoryId: parseInt(data.categoryId.toString()),
      },
    });
  }

  @Delete('expenses/:id')
  async deleteExpense(@Param('id') id: string) {
    return this.prisma.expense.delete({ where: { id: parseInt(id) } });
  }
}
