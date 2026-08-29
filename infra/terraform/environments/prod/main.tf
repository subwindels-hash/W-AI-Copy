terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket  = "windels-tfstate-prod"
    key     = "windels/prod/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

module "windels" {
  source = "../../"
  environment         = "prod"
  aws_region          = "us-east-1"
  availability_zones  = ["us-east-1a", "us-east-1b", "us-east-1c"]
  db_instance_class   = "db.t4g.medium"
  cache_instance_class = "cache.t4g.medium"
  db_allocated_storage = 100
}
