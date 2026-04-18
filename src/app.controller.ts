/*eslint-disable*/
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Res,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports/reports.service';
import { AuthGuard } from './auth/auth.guard';
import { CloudinaryService } from './cloudinary.service';
import type { Response } from 'express';

@UseGuards(AuthGuard)
@Controller('api')
export class AppController {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // 👇 HELPER DE REGISTRO DE AUDITORÍA
  private async createLog(req: any, action: string, details: string) {
    const username = req.user?.username || 'SYSTEM';
    await this.prisma.auditLog.create({
      data: {
        action,
        details,
        user: username,
        ip: req.ip,
      },
    });
  }

  // --- 1. RUTA PARA CONSULTAR LOGS DE AUDITORÍA ---
  @Get('logs')
  @UseGuards(AuthGuard)
  async getLogs(@Req() req: any) {
    if (req.user.role !== 'ADMIN') {
      throw new HttpException(
        'Acceso denegado a la bóveda de auditoría.',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // --- 2. ESTADÍSTICAS Y LISTAS (ACTUALIZADO A LA NUEVA LÓGICA) ---
  @Get('stats')
  async getStats() {
    const totalMembers = await this.prisma.member.count({
      where: { status: 'ACTIVE' },
    });
    const revenueData = await this.prisma.payment.aggregate({
      _sum: { amount: true },
    });

    // 👇 NUEVO: Ahora contamos los eventos en lugar de los productos
    const totalEvents = await this.prisma.event.count();

    return {
      members: totalMembers,
      revenue: revenueData._sum.amount || 0,
      activeEvents: totalEvents, // Mandamos la estadística de eventos
      lowStock: 0, // Lo dejamos en 0 para que la tarjeta amarilla del Dashboard no explote
    };
  }

  @Get('members')
  async getMembers() {
    return this.prisma.member.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('payments')
  @UseGuards(AuthGuard)
  async getPayments() {
    try {
      return await this.prisma.payment.findMany({
        include: {
          member: true,
        },
        orderBy: {
          date: 'desc',
        },
      });
    } catch (error) {
      console.error('Error obteniendo pagos:', error);
      throw new HttpException(
        'Error al cargar transacciones',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // --- 3. CREACIÓN Y GESTIÓN DE DATOS CON LOGS ---
  @Post('members')
  async createMember(
    @Body() data: { name: string; email?: string },
    @Req() req: any,
  ) {
    const member = await this.prisma.member.create({
      data: {
        name: data.name,
        email: data.email && data.email.trim() !== '' ? data.email : null,
        status: 'ACTIVE',
      },
    });
    await this.createLog(
      req,
      'CREATE_MEMBER',
      `Registró al nuevo miembro: ${member.name}`,
    );
    return member;
  }

  @Delete('members/:id')
  async deleteMember(@Param('id') id: string, @Req() req: any) {
    const member = await this.prisma.member.findUnique({
      where: { id: parseInt(id) },
    });
    await this.createLog(
      req,
      'DELETE_MEMBER',
      `Eliminó al miembro: ${member?.name} (ID: ${id})`,
    );
    return this.prisma.member.delete({ where: { id: parseInt(id) } });
  }

  @Post('payments')
  @UseInterceptors(FileInterceptor('file'))
  async createPayment(
    @Body() data: any,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    let secureUrl = null;
    if (file) {
      try {
        const uploadResult = await this.cloudinaryService.uploadFile(file);
        secureUrl = uploadResult.secure_url;
      } catch (error) {
        console.error('Error Cloudinary:', error);
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        memberId: parseInt(data.memberId),
        amount: parseFloat(data.amount),
        concept: data.concept || '',
        receiptUrl: secureUrl,
      },
    });

    await this.createLog(
      req,
      'CREATE_PAYMENT',
      `Registró un pago de $${payment.amount} para el miembro ID: ${payment.memberId}`,
    );
    return payment;
  }

  @Delete('payments/:id')
  async deletePayment(@Param('id') id: string, @Req() req: any) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: parseInt(id) },
    });
    await this.createLog(
      req,
      'DELETE_PAYMENT',
      `Eliminó el pago #${id} por un monto de $${payment?.amount}`,
    );
    return this.prisma.payment.delete({ where: { id: parseInt(id) } });
  }

  // --- 4. REPORTES (PDF) ---

  @Get('members/print')
  async printMembersDirectory(@Res() res: Response) {
    const buffer = await this.reports.generateMemberDirectory();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=Directorio_Miembros.pdf',
    });
    res.end(buffer);
  }

  @Get('payments/:id/print')
  async printReceipt(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reports.generateSingleReceipt(parseInt(id));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Recibo_${id}.pdf`,
    });
    res.end(buffer);
  }

  @Get('financial')
  async downloadGeneralReport(@Res() res: Response) {
    const buffer = await this.reports.generateMonthlyReport();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=Reporte_Maestro.pdf',
    });
    res.end(buffer);
  }
}
