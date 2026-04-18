/*eslint-disable*/
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
// 👇 1. Importamos el servicio de reportes y el tipo Response
import { ReportsService } from '../reports/reports.service';
import type { Response } from 'express';

@UseGuards(AuthGuard)
@Controller('api/rooms')
export class RoomsController {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService, // 👇 2. Lo inyectamos aquí
  ) {}

  private async createLog(req: any, action: string, details: string) {
    const username = req.user?.username || 'SYSTEM';
    await this.prisma.auditLog.create({
      data: { action, details, user: username, ip: req.ip },
    });
  }

  // --- OBTENER HABITACIONES ---
  @Get()
  async getRooms() {
    return this.prisma.room.findMany({
      include: { members: true },
      orderBy: { name: 'asc' },
    });
  }

  // 👇 3. NUEVA RUTA: IMPRIMIR TODAS LAS HABITACIONES
  // IMPORTANTE: 'print' debe ir ANTES que las rutas con ':id'
  @Get('print')
  async printAllRooms(@Res() res: Response) {
    const buffer = await this.reports.generateAllRoomsReport();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=Reporte_Habitaciones.pdf',
    });
    res.end(buffer);
  }

  // 👇 4. NUEVA RUTA: IMPRIMIR UNA SOLA HABITACIÓN
  @Get(':id/print')
  async printSingleRoom(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reports.generateSingleRoomReport(parseInt(id));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Habitacion_${id}.pdf`,
    });
    res.end(buffer);
  }

  // --- CREAR HABITACIÓN ---
  @Post()
  async createRoom(
    @Body() data: { name: string; capacity: number; memberIds: number[] },
    @Req() req: any,
  ) {
    const room = await this.prisma.room.create({
      data: { name: data.name, capacity: parseInt(data.capacity.toString()) },
    });

    if (data.memberIds && data.memberIds.length > 0) {
      await this.prisma.member.updateMany({
        where: {
          id: { in: data.memberIds.map((id) => parseInt(id.toString())) },
        },
        data: { roomId: room.id },
      });
    }

    await this.createLog(
      req,
      'CREATE_ROOM',
      `Creó la habitación: ${room.name} con capacidad ${room.capacity}`,
    );
    return room;
  }

  // --- ELIMINAR HABITACIÓN ---
  @Delete(':id')
  async deleteRoom(@Param('id') id: string, @Req() req: any) {
    const room = await this.prisma.room.findUnique({
      where: { id: parseInt(id) },
    });
    await this.createLog(
      req,
      'DELETE_ROOM',
      `Eliminó la habitación: ${room?.name}`,
    );
    return this.prisma.room.delete({ where: { id: parseInt(id) } });
  }
}
