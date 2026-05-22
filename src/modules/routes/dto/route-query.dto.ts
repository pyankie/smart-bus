import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@ApiTags('Routes')
export class RouteQueryDto extends PaginationQueryDto {}
