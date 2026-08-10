import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePeerDto } from '../../peers/dto/create-peer.dto';
import type { PeerResponseDto } from '../../peers/dto/peer-response.dto';
import { PeersService, type PeerListResult, type RotatedPeerKey } from '../../peers/peers.service';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { UpdatePeerDto } from '../dto/update-peer.dto';
import { AdminBaseController } from './admin-base.controller';
import {
  ApiCreatePeer,
  ApiDeletePeer,
  ApiGetPeer,
  ApiListPeers,
  ApiPeersController,
  ApiRotatePeerKey,
  ApiUpdatePeer,
} from './peers.docs';

@ApiPeersController()
@Controller('admin/peers')
export class PeersAdminController extends AdminBaseController {
  constructor(private readonly peersService: PeersService) {
    super();
  }

  @Get()
  @ApiListPeers()
  list(@Query() query: PaginationQueryDto): Promise<PeerListResult> {
    return this.peersService.findAll(query.page, query.pageSize);
  }

  @Get(':id')
  @ApiGetPeer()
  findOne(@Param('id') id: string): Promise<PeerResponseDto> {
    return this.peersService.findOne(id);
  }

  @Post()
  @ApiCreatePeer()
  create(@Body() dto: CreatePeerDto): Promise<PeerResponseDto> {
    return this.peersService.create(dto);
  }

  @Patch(':id')
  @ApiUpdatePeer()
  update(@Param('id') id: string, @Body() dto: UpdatePeerDto): Promise<PeerResponseDto> {
    return this.peersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiDeletePeer()
  remove(@Param('id') id: string): Promise<void> {
    return this.peersService.remove(id);
  }

  @Post(':id/rotate-key')
  @ApiRotatePeerKey()
  rotateKey(@Param('id') id: string): Promise<RotatedPeerKey> {
    return this.peersService.rotateKey(id);
  }
}
