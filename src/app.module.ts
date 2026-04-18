import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt'; // 👈 Importar JWT
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaService } from '../prisma/prisma.service'; // Ruta conservada de tu original
import { ReportsService } from './reports/reports.service';
import { AuthController } from './auth.controller'; // 👈 Importar Auth
import { CloudinaryService } from './cloudinary.service'; // 👈 IMPORTAR CLOUDINARY
import { RoomsController } from './rooms/rooms.controller'; // 👈 IMPORTA AQUÍ
import { EventsController } from './events/events.controller'; // 👈 1. IMPORTAR EVENTS CONTROLLER

@Module({
  imports: [
    // 👇 Configurar el generador de Tokens

    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    RoomsController,
    EventsController, // 👈 2. REGISTRAR AQUÍ PARA ACTIVAR LAS RUTAS DE EVENTOS
  ],
  providers: [
    PrismaService,
    ReportsService,
    CloudinaryService, // 👈 AÑADIR AL FINAL
  ],
})
export class AppModule {}
